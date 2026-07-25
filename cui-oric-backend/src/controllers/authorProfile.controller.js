/**
 * Author Profile Controller
 * Profile management for faculty and students
 */

const AuthorProfile = require("../models/AuthorProfile");
const User = require("../models/User");
const Department = require("../models/Department");
const ResearchInterest = require("../models/ResearchInterest");
const { metricsService } = require("../services/metrics.service");
const CoAuthorNetwork = require("../models/CoAuthorNetwork");
const catchAsync = require("../utils/catchAsync");
const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} = require("../utils/AppError");
const { success, paginationMeta } = require("../utils/apiResponse");
const { escapeRegex } = require("../utils/escapeRegex");
const logger = require("../config/logger");

/**
 * Get own author profile
 * GET /api/v1/author-profile/me
 */
const getMyProfile = catchAsync(async (req, res) => {
  const profile = await AuthorProfile.findOne({ userId: req.user._id })
    .populate("userId", "name email role campus")
    .populate("departmentId", "name campus")
    .lean();

  if (!profile) {
    throw new NotFoundError("Author profile not found");
  }

  return success(res, profile, "Profile retrieved");
});

/**
 * Update own author profile
 * PATCH /api/v1/author-profile/me
 */
const updateMyProfile = catchAsync(async (req, res) => {
  const allowedFields = [
    "designation",
    "affiliation",
    "researchInterests",
    "homepageUrl",
    "orcidId",
    "googleScholarId",
    "photoUrl",
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  // Validate research interests
  if (updates.researchInterests) {
    if (!Array.isArray(updates.researchInterests)) {
      throw new BadRequestError("Research interests must be an array");
    }
    // Normalize tags
    updates.researchInterests = updates.researchInterests
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0 && tag.length <= 50);
    // Remove duplicates
    updates.researchInterests = [...new Set(updates.researchInterests)];

    // Update research interest follower counts
    const currentProfile = await AuthorProfile.findOne({
      userId: req.user._id,
    });
    const oldInterests = currentProfile?.researchInterests || [];

    // Decrement old
    for (const tag of oldInterests) {
      if (!updates.researchInterests.includes(tag)) {
        await ResearchInterest.decrementFollower(tag);
      }
    }

    // Increment new
    for (const tag of updates.researchInterests) {
      if (!oldInterests.includes(tag)) {
        await ResearchInterest.incrementFollower(tag);
      }
    }
  }

  // Validate ORCID format
  if (
    updates.orcidId &&
    !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(updates.orcidId)
  ) {
    throw new BadRequestError("Invalid ORCID format");
  }

  // Validate URLs
  if (updates.homepageUrl && !/^https?:\/\/.+/.test(updates.homepageUrl)) {
    throw new BadRequestError("Invalid homepage URL");
  }
  if (updates.photoUrl && !/^https?:\/\/.+/.test(updates.photoUrl)) {
    throw new BadRequestError("Invalid photo URL");
  }

  const profile = await AuthorProfile.findOneAndUpdate(
    { userId: req.user._id },
    updates,
    { new: true, runValidators: true },
  )
    .populate("userId", "name email role campus")
    .populate("departmentId", "name campus");

  if (!profile) {
    throw new NotFoundError("Author profile not found");
  }

  return success(res, profile, "Profile updated");
});

/**
 * Upload/replace own profile photo
 * POST /api/v1/author-profile/me/photo
 */
const uploadPhoto = catchAsync(async (req, res) => {
  const { s3Service } = require("../services/s3.service");

  if (!req.uploadedAvatar) {
    throw new BadRequestError("No photo uploaded");
  }

  const profile = await AuthorProfile.findOne({ userId: req.user._id }).select(
    "+photoKey",
  );
  if (!profile) {
    throw new NotFoundError("Author profile not found");
  }

  // Delete the old photo from S3, but only if we're the ones who stored it
  // (i.e. it has a photoKey) — a user who pasted an external URL doesn't have
  // one, and there's nothing of ours to clean up in that case.
  if (profile.photoKey) {
    try {
      await s3Service.deleteFile(profile.photoKey);
    } catch (error) {
      logger.warn("Failed to delete old profile photo:", error.message);
    }
  }

  const { key, url } = await s3Service.uploadAvatar(
    req.uploadedAvatar.buffer,
    req.user._id.toString(),
    req.uploadedAvatar.extension,
    req.uploadedAvatar.mimeType,
  );

  profile.photoUrl = url;
  profile.photoKey = key;
  await profile.save();

  return success(res, { photoUrl: url }, "Profile photo uploaded");
});

/**
 * Remove own profile photo
 * DELETE /api/v1/author-profile/me/photo
 */
const deletePhoto = catchAsync(async (req, res) => {
  const { s3Service } = require("../services/s3.service");

  const profile = await AuthorProfile.findOne({ userId: req.user._id }).select(
    "+photoKey",
  );
  if (!profile) {
    throw new NotFoundError("Author profile not found");
  }

  if (profile.photoKey) {
    try {
      await s3Service.deleteFile(profile.photoKey);
    } catch (error) {
      logger.warn("Failed to delete profile photo from S3:", error.message);
    }
  }

  profile.photoUrl = undefined;
  profile.photoKey = undefined;
  await profile.save();

  return success(res, null, "Profile photo removed");
});

/**
 * Get author profile by ID (public)
 * GET /api/v1/author-profile/:id
 */
const getAuthorProfile = catchAsync(async (req, res) => {
  const profile = await AuthorProfile.findById(req.params.id)
    .populate("userId", "name email role campus status")
    .populate("departmentId", "name campus")
    .lean();

  if (!profile) {
    throw new NotFoundError("Author profile not found");
  }

  // Only show active users' profiles publicly
  if (profile.userId && profile.userId.status !== "active") {
    if (
      !req.user ||
      (req.user.role !== "oric_admin" &&
        req.user._id.toString() !== profile.userId._id.toString())
    ) {
      throw new NotFoundError("Author profile not found");
    }
  }

  return success(res, profile, "Profile retrieved");
});

/**
 * List/search author profiles
 * GET /api/v1/author-profile
 */
const listAuthorProfiles = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    departmentId,
    researchInterest,
    search,
    sortBy,
    sortOrder,
  } = req.query;

  const query = {};

  if (departmentId) query.departmentId = departmentId;
  if (researchInterest)
    query.researchInterests = researchInterest.toLowerCase().trim();
  if (search) {
    query.$or = [
      { designation: { $regex: escapeRegex(search), $options: "i" } },
      { affiliation: { $regex: escapeRegex(search), $options: "i" } },
    ];
  }

  // Whitelist of allowed sort fields mapped to actual document paths
  const SORT_FIELDS = {
    hIndex: "metrics.hIndex",
    citations: "metrics.totalCitations",
    createdAt: "createdAt",
    designation: "designation",
  };

  const resolvedSortBy = SORT_FIELDS[sortBy] || "metrics.hIndex";
  const resolvedSortOrder =
    sortOrder && sortOrder.toLowerCase() === "asc" ? "asc" : "desc";
  const sort = { [resolvedSortBy]: resolvedSortOrder === "desc" ? -1 : 1 };

  const profiles = await AuthorProfile.find(query)
    .populate("userId", "name email role campus status")
    .populate("departmentId", "name campus")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await AuthorProfile.countDocuments(query);
  return success(
    res,
    profiles,
    "Profiles retrieved",
    paginationMeta(page, limit, total, Math.ceil(total / limit)),
  );
});

/**
 * Recompute metrics for own profile (or admin for any)
 * POST /api/v1/author-profile/:id/recompute-metrics
 */
const recomputeMetrics = catchAsync(async (req, res) => {
  // Some routes ('/me/...') have no :id param at all (req.params.id is
  // undefined), while others ('/:id/...') can be hit with id='me'. Treat
  // both as "own profile".
  const profileId =
    !req.params.id || req.params.id === "me"
      ? (await AuthorProfile.findOne({ userId: req.user._id }).select("_id"))
          ?._id
      : req.params.id;

  if (!profileId) {
    throw new NotFoundError("Author profile not found");
  }

  // Check permissions
  const profile = await AuthorProfile.findById(profileId).populate("userId");
  if (!profile) {
    throw new NotFoundError("Author profile not found");
  }

  const isOwner =
    profile.userId && profile.userId._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "oric_admin";

  if (!isOwner && !isAdmin) {
    throw new ForbiddenError(
      "Not authorized to recompute metrics for this profile",
    );
  }

  const metrics = await metricsService.recomputeAuthorMetrics(profileId);

  return success(res, metrics, "Metrics recomputed");
});

/**
 * Get co-authors for a profile
 * GET /api/v1/author-profile/:id/co-authors
 */
const getCoAuthors = catchAsync(async (req, res) => {
  // Some routes ('/me/...') have no :id param at all (req.params.id is
  // undefined), while others ('/:id/...') can be hit with id='me'. Treat
  // both as "own profile".
  const profileId =
    !req.params.id || req.params.id === "me"
      ? (await AuthorProfile.findOne({ userId: req.user._id }).select("_id"))
          ?._id
      : req.params.id;

  if (!profileId) {
    throw new NotFoundError("Author profile not found");
  }

  const { limit = 50, minCollaborations = 1 } = req.query;

  const coAuthors = await CoAuthorNetwork.getCoAuthors(profileId, {
    limit: parseInt(limit),
    minCollaborations: parseInt(minCollaborations),
  });

  return success(res, coAuthors, "Co-authors retrieved");
});

/**
 * Get collaboration network for visualization
 * GET /api/v1/author-profile/:id/network
 */
const getNetwork = catchAsync(async (req, res) => {
  // Some routes ('/me/...') have no :id param at all (req.params.id is
  // undefined), while others ('/:id/...') can be hit with id='me'. Treat
  // both as "own profile".
  const profileId =
    !req.params.id || req.params.id === "me"
      ? (await AuthorProfile.findOne({ userId: req.user._id }).select("_id"))
          ?._id
      : req.params.id;

  if (!profileId) {
    throw new NotFoundError("Author profile not found");
  }

  const { depth = 1 } = req.query;
  const network = await CoAuthorNetwork.getNetwork(profileId, parseInt(depth));

  return success(res, network, "Network retrieved");
});

/**
 * Get author metrics summary (for dashboard)
 * GET /api/v1/author-profile/:id/metrics-summary
 */
const getMetricsSummary = catchAsync(async (req, res) => {
  // Some routes ('/me/...') have no :id param at all (req.params.id is
  // undefined), while others ('/:id/...') can be hit with id='me'. Treat
  // both as "own profile".
  const profileId =
    !req.params.id || req.params.id === "me"
      ? (await AuthorProfile.findOne({ userId: req.user._id }).select("_id"))
          ?._id
      : req.params.id;

  if (!profileId) {
    throw new NotFoundError("Author profile not found");
  }

  const profile = await AuthorProfile.findById(profileId)
    .populate("userId", "name email role")
    .select("metrics coAuthors researchInterests designation")
    .lean();

  if (!profile) {
    throw new NotFoundError("Author profile not found");
  }
  if (!profile.userId) {
    throw new NotFoundError("Linked user account not found for this profile");
  }

  // Get publication counts by status
  const Publication = require("../models/Publication");
  const pubStats = await Publication.aggregate([
    { $match: { "authors.authorId": profile.userId._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  // Recent publications
  const recentPubs = await Publication.find({
    "authors.authorId": profile.userId._id,
  })
    .select("title year venue.name status citationCount")
    .sort({ year: -1 })
    .limit(5)
    .lean();

  return success(
    res,
    {
      profile: {
        id: profile._id,
        name: profile.userId.name,
        email: profile.userId.email,
        role: profile.userId.role,
        designation: profile.designation,
      },
      metrics: profile.metrics,
      publicationStats: pubStats,
      recentPublications: recentPubs,
      coAuthorCount: profile.coAuthors?.length || 0,
      researchInterests: profile.researchInterests,
    },
    "Metrics summary retrieved",
  );
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  uploadPhoto,
  deletePhoto,
  getAuthorProfile,
  listAuthorProfiles,
  recomputeMetrics,
  getCoAuthors,
  getNetwork,
  getMetricsSummary,
};