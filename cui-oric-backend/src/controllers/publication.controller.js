/**
 * Publication Controller
 * Full publication lifecycle with workflow state machine
 */

const Publication = require("../models/Publication");
const PublicationReview = require("../models/PublicationReview");
const Department = require("../models/Department");
const User = require("../models/User");
const { s3Service } = require("../services/s3.service");
const { aiReviewService } = require("../services/aiReview.service");
const { metricsService } = require("../services/metrics.service");
const catchAsync = require("../utils/catchAsync");
const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} = require("../utils/AppError");
const { success, paginationMeta } = require("../utils/apiResponse");
const logger = require("../config/logger");
const config = require("../config/env");

/**
 * Create draft publication
 * POST /api/v1/publications
 */
const createPublication = catchAsync(async (req, res) => {
  const userId = req.user._id;

  // Prepare publication data
  const pubData = {
    ...req.body,
    submittedBy: userId,
    createdBy: userId,
    departmentId: req.user.departmentId,
    status: "draft",
  };

  // Validate authors - at least one internal author (the submitter)
  const hasInternalAuthor = pubData.authors.some(
    (a) => a.authorId && a.authorId.toString() === userId.toString(),
  );
  if (!hasInternalAuthor) {
    // Auto-add submitter as first author if not present
    pubData.authors.unshift({
      authorId: userId,
      order: 1,
      isCorresponding: true,
    });
    // Renumber orders
    pubData.authors.forEach((a, i) => {
      a.order = i + 1;
    });
  }

  // Ensure only one corresponding author
  const correspondingCount = pubData.authors.filter(
    (a) => a.isCorresponding,
  ).length;
  if (correspondingCount === 0) {
    pubData.authors[0].isCorresponding = true;
  } else if (correspondingCount > 1) {
    // Keep first one, unset others
    let found = false;
    pubData.authors.forEach((a) => {
      if (a.isCorresponding) {
        if (!found) found = true;
        else a.isCorresponding = false;
      }
    });
  }

  const publication = await Publication.create(pubData);

  return success(res, publication, "Draft publication created", null, 201);
});

/**
 * Update draft publication (only owner, only in draft status)
 * PATCH /api/v1/publications/:id
 */
const updatePublication = catchAsync(async (req, res) => {
  const publication = req.publication; // From requirePublicationAccess middleware

  // Only allow updates in draft status
  if (publication.status !== "draft") {
    throw new BadRequestError("Can only edit draft publications");
  }

  // Only owner can edit
  const isOwner =
    publication.submittedBy.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "oric_admin") {
    throw new ForbiddenError("Only the owner can edit this publication");
  }

  // Prevent changing certain fields
  const {
    status,
    submittedBy,
    createdBy,
    departmentId,
    citationCount,
    citedByIds,
    aiReview,
    ...updates
  } = req.body;

  // Validate authors if provided
  if (updates.authors) {
    const hasInternalAuthor = updates.authors.some(
      (a) => a.authorId && a.authorId.toString() === req.user._id.toString(),
    );
    if (!hasInternalAuthor && req.user.role !== "oric_admin") {
      // Auto-add submitter as internal author, matching createPublication's contract
      updates.authors.unshift({
        authorId: req.user._id,
        order: 1,
        isCorresponding: !updates.authors.some((a) => a.isCorresponding),
      });
      updates.authors.forEach((a, i) => {
        a.order = i + 1;
      });
    }
  }

  Object.assign(publication, updates);
  await publication.save();

  return success(res, publication, "Publication updated");
});

/**
 * Submit draft for HOD review
 * POST /api/v1/publications/:id/submit
 */
const submitPublication = catchAsync(async (req, res) => {
  const publication = req.publication;

  if (publication.status !== "draft") {
    throw new BadRequestError("Only draft publications can be submitted");
  }

  // Only owner can submit
  const isOwner =
    publication.submittedBy.toString() === req.user._id.toString();
  if (!isOwner) {
    throw new ForbiddenError("Only the owner can submit this publication");
  }

  // Validate required fields for submission
  if (!publication.pdfFile) {
    throw new BadRequestError("PDF file must be uploaded before submission");
  }

  const { remarks } = req.body;

  // Transition: draft -> submitted_to_hod
  const previousStatus = publication.status;
  publication.status = "submitted_to_hod";
  publication.lastRemarks = remarks || "";
  await publication.save();

  // Create review record
  await PublicationReview.createReview({
    publicationId: publication._id,
    stage: "hod_review",
    reviewedBy: req.user._id,
    decision: "submitted",
    remarks: remarks || "Submitted for HOD review",
    previousStatus,
    newStatus: publication.status,
  });

  // Notify HOD (async)
  const department = await Department.findById(
    publication.departmentId,
  ).populate("hodId");
  if (department?.hodId) {
    // TODO: Send notification email to HOD
  }

  return success(res, publication, "Publication submitted for HOD review");
});

/**
 * Resubmit a rejected publication back to draft for revision
 * POST /api/v1/publications/:id/resubmit
 */
const resubmitPublication = catchAsync(async (req, res) => {
  const publication = req.publication;

  if (!["hod_rejected", "oric_rejected"].includes(publication.status)) {
    throw new BadRequestError(
      "Only rejected publications can be resubmitted for revision",
    );
  }

  const isOwner =
    publication.submittedBy.toString() === req.user._id.toString();
  if (!isOwner) {
    throw new ForbiddenError("Only the owner can resubmit this publication");
  }

  const { remarks } = req.body;
  const previousStatus = publication.status;
  const stage =
    previousStatus === "hod_rejected" ? "hod_review" : "oric_review";

  publication.status = "draft";
  publication.lastRemarks = remarks || "Returned to draft for revision";
  await publication.save();

  await PublicationReview.createReview({
    publicationId: publication._id,
    stage,
    reviewedBy: req.user._id,
    decision: "returned_for_correction",
    remarks: remarks || "Author moved publication back to draft for revision",
    previousStatus,
    newStatus: publication.status,
  });

  return success(
    res,
    publication,
    "Publication moved back to draft. You may edit and resubmit.",
  );
});

/**
 * HOD review (approve/reject)
 * POST /api/v1/publications/:id/hod-review
 */
const hodReview = catchAsync(async (req, res) => {
  const publication = req.publication;
  const { decision, remarks } = req.body;

  // ORIC Admin bypasses department scoping; HOD must match their own department
  if (req.user.role === "hod") {
    const department = await Department.findOne({ hodId: req.user._id });
    if (
      !department ||
      publication.departmentId.toString() !== department._id.toString()
    ) {
      throw new ForbiddenError(
        "You can only review publications from your department",
      );
    }
  }

  if (publication.status !== "submitted_to_hod") {
    throw new BadRequestError("Publication is not pending HOD review");
  }

  const previousStatus = publication.status;
  let newStatus;

  if (decision === "approved") {
    newStatus = "hod_approved";
    // Auto-transition to sent_to_oric
    publication.status = "sent_to_oric";
  } else {
    newStatus = "hod_rejected";
    publication.status = "hod_rejected";
  }

  publication.lastRemarks = remarks;
  await publication.save();

  // Create review record
  await PublicationReview.createReview({
    publicationId: publication._id,
    stage: "hod_review",
    reviewedBy: req.user._id,
    decision: decision === "approved" ? "approved" : "rejected",
    remarks,
    previousStatus,
    newStatus: publication.status,
  });

  // If approved and sent to ORIC, notify ORIC admins
  if (decision === "approved") {
    // TODO: Notify ORIC admins
  }

  // Notify submitter
  // TODO: Send email to submitter

  return success(res, publication, `Publication ${decision} by HOD`);
});

/**
 * ORIC review (verify/reject)
 * POST /api/v1/publications/:id/oric-review
 */
const oricReview = catchAsync(async (req, res) => {
  const publication = req.publication;
  const { decision, remarks } = req.body; // decision: 'verified' | 'rejected'

  if (publication.status !== "sent_to_oric") {
    throw new BadRequestError("Publication is not pending ORIC review");
  }

  const previousStatus = publication.status;
  let newStatus;

  if (decision === "verified") {
    newStatus = "oric_verified";
    publication.status = "oric_verified";
  } else {
    newStatus = "oric_rejected";
    publication.status = "oric_rejected";
  }

  publication.lastRemarks = remarks;
  await publication.save();

  // Create review record
  await PublicationReview.createReview({
    publicationId: publication._id,
    stage: "oric_review",
    reviewedBy: req.user._id,
    decision: decision === "verified" ? "approved" : "rejected",
    remarks,
    previousStatus,
    newStatus: publication.status,
  });

  // If verified, trigger async metrics recomputation
  if (decision === "verified") {
    metricsService.triggerPostVerificationMetrics(publication._id);
  }

  // Notify submitter
  // TODO: Send email to submitter

  return success(res, publication, `Publication ${decision} by ORIC`);
});

/**
 * List publications with filters
 * GET /api/v1/publications
 */
const listPublications = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    year,
    departmentId,
    publicationType,
    search,
    authorId,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build query based on user role and permissions
  let query = {};

  // Public/unauthenticated users: only oric_verified
  if (!req.user) {
    query.status = "oric_verified";
  } else if (req.user.role === "oric_admin") {
    // Admin sees everything except other users' drafts
    query.$or = [{ status: { $ne: "draft" } }, { submittedBy: req.user._id }];
    if (status) {
      const orConditions = query.$or;
      query = { $and: [{ $or: orConditions }, { status }] };
    }
  } else if (req.user.role === "hod") {
    // HOD sees department publications + own
    const department = await Department.findOne({ hodId: req.user._id });
    if (department) {
      query.$or = [
        { departmentId: department._id, status: { $ne: "draft" } },
        { submittedBy: req.user._id },
      ];
    }
    if (status) {
      // Apply status filter within scope
      const orConditions = query.$or;
      query = { $and: [{ $or: orConditions }, { status }] };
    }
  } else {
    // Faculty/students: own publications (all statuses)
    query.$or = [
      { submittedBy: req.user._id },
      { "authors.authorId": req.user._id },
    ];
    if (status) {
      const orConditions = query.$or;
      query = { $and: [{ $or: orConditions }, { status }] };
    }
  }

  // Additional filters
  if (year) query.year = parseInt(year);
  if (departmentId) query.departmentId = departmentId;
  if (publicationType) query.publicationType = publicationType;
  if (authorId) query["authors.authorId"] = authorId;

  // Text search
  if (search) {
    query.$text = { $search: search };
  }

  // Sort
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Execute query
  const publications = await Publication.find(query)
    .populate("submittedBy", "name email")
    .populate("departmentId", "name")
    .populate("authors.authorId", "name email")
    .select("-aiReview") // Don't include AI review in list
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Publication.countDocuments(query);

  return success(
    res,
    publications,
    "Publications retrieved",
    paginationMeta(page, limit, total, Math.ceil(total / limit)),
  );
});

/**
 * Get publication by ID
 * GET /api/v1/publications/:id
 */
const getPublication = catchAsync(async (req, res) => {
  const publication = req.publication; // From requirePublicationAccess

  // Populate additional fields for detail view
  await publication.populate([
    { path: "submittedBy", select: "name email" },
    { path: "departmentId", select: "name campus" },
    { path: "authors.authorId", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);

  // Get review history
  const reviews = await PublicationReview.find({
    publicationId: publication._id,
  })
    .populate("reviewedBy", "name email role")
    .sort({ reviewedAt: 1 })
    .lean();

  // Get AI review suggestions (ephemeral) if PDF exists
  let qualitativeSuggestions = null;
  if (
    publication.pdfFile &&
    (req.user?.role === "oric_admin" ||
      req.user?.role === "hod" ||
      publication.submittedBy.toString() === req.user?._id.toString())
  ) {
    try {
      qualitativeSuggestions = await aiReviewService.getQualitativeSuggestions(
        publication.pdfFile,
      );
    } catch (error) {
      logger.warn("Failed to get qualitative suggestions:", error.message);
    }
  }

  return success(
    res,
    {
      ...publication.toObject(),
      reviews,
      qualitativeSuggestions,
    },
    "Publication retrieved",
  );
});

/**
 * Delete publication (ORIC Admin only)
 * DELETE /api/v1/publications/:id
 */
const deletePublication = catchAsync(async (req, res) => {
  const publication = await Publication.findById(req.params.id);
  if (!publication) {
    throw new NotFoundError("Publication not found");
  }

  // Delete PDF from S3 if exists
  if (publication.pdfFile) {
    try {
      await s3Service.deleteFile(publication.pdfFile);
    } catch (error) {
      logger.error("Failed to delete PDF from S3:", error.message);
    }
  }

  // Delete associated reviews
  await PublicationReview.deleteMany({ publicationId: publication._id });

  // Delete citations
  const Citation = require("../models/Citation");
  await Citation.deleteMany({
    $or: [
      { citingPaperId: publication._id },
      { citedPaperId: publication._id },
    ],
  });

  // Update citation counts for papers that cited this
  await Publication.updateMany(
    { citedByIds: publication._id },
    { $pull: { citedByIds: publication._id }, $inc: { citationCount: -1 } },
  );

  // Delete publication
  await Publication.findByIdAndDelete(req.params.id);

  return success(res, null, "Publication deleted");
});

/**
 * Update publication metadata (ORIC Admin correction)
 * PATCH /api/v1/publications/:id/metadata
 */
const updateMetadata = catchAsync(async (req, res) => {
  const publication = await Publication.findById(req.params.id);
  if (!publication) {
    throw new NotFoundError("Publication not found");
  }

  // Only allow certain fields to be corrected
  const allowedFields = [
    "title",
    "abstract",
    "venue",
    "year",
    "publicationDate",
    "doi",
    "url",
    "keywords",
    "publicationType",
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  Object.assign(publication, updates);
  await publication.save();

  return success(res, publication, "Metadata updated");
});

/**
 * Upload PDF for publication
 * POST /api/v1/publications/:id/upload-pdf
 */
const uploadPdf = catchAsync(async (req, res) => {
  const publication = req.publication;

  // Check if publication is in editable state
  if (
    !["draft", "hod_rejected", "oric_rejected"].includes(publication.status)
  ) {
    throw new BadRequestError("Cannot upload PDF in current publication state");
  }

  // Only owner can upload
  const isOwner =
    publication.submittedBy.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "oric_admin") {
    throw new ForbiddenError("Only the owner can upload PDF");
  }

  if (!req.uploadedFile) {
    throw new BadRequestError("No PDF file uploaded");
  }

  // Delete old PDF if exists
  if (publication.pdfFile) {
    try {
      await s3Service.deleteFile(publication.pdfFile);
    } catch (error) {
      logger.warn("Failed to delete old PDF:", error.message);
    }
  }

  // Upload new PDF to S3
  const { key } = await s3Service.uploadPdf(
    req.uploadedFile.buffer,
    publication._id.toString(),
    req.uploadedFile.originalName,
  );

  // Update publication
  publication.pdfFile = key;
  publication.aiReview = publication.aiReview || {};
  publication.aiReview.virusScanStatus = "skipped";
  await publication.save();

  // Run AI review pipeline asynchronously
  setImmediate(async () => {
    try {
      const aiResults = await aiReviewService.runAiReview(
        req.uploadedFile.buffer,
      );

      publication.aiReview = {
        ...publication.aiReview,
        ...aiResults,
      };
      await publication.save({ validateBeforeSave: false });

      logger.info(`AI review completed for publication ${publication._id}`);
    } catch (error) {
      logger.error("AI review failed:", error);
      publication.aiReview = publication.aiReview || {};
      publication.aiReview.virusScanStatus = "skipped"; // Keep as skipped, just AI failed
      await publication.save({ validateBeforeSave: false });
    }
  });

  // Generate download URL for immediate access
  const downloadUrl = await s3Service.getDownloadUrl(key);

  return success(
    res,
    { key, downloadUrl },
    "PDF uploaded successfully. AI review started.",
  );
});

/**
 * Get PDF download URL
 * GET /api/v1/publications/:id/download
 */
const getDownloadUrl = catchAsync(async (req, res) => {
  const publication = req.publication;

  if (!publication.pdfFile) {
    throw new NotFoundError("No PDF file available");
  }

  // Check access permissions
  if (publication.status !== "oric_verified") {
    const isOwner =
      publication.submittedBy.toString() === req.user?._id.toString();
    const isAdmin = req.user?.role === "oric_admin";

    let isHod = false;
    if (req.user?.role === "hod") {
      const hodDepartment = await Department.findOne({
        hodId: req.user._id,
      }).select("_id");
      isHod =
        !!hodDepartment &&
        hodDepartment._id.toString() === publication.departmentId.toString();
    }

    if (!isOwner && !isHod && !isAdmin) {
      throw new ForbiddenError("PDF not available for this publication");
    }
  }

  const downloadUrl = await s3Service.getDownloadUrl(publication.pdfFile, 3600); // 1 hour

  return success(res, { downloadUrl }, "Download URL generated");
});

/**
 * Get publication review history
 * GET /api/v1/publications/:id/reviews
 */
const getReviews = catchAsync(async (req, res) => {
  const publication = req.publication;

  const reviews = await PublicationReview.find({
    publicationId: publication._id,
  })
    .populate("reviewedBy", "name email role")
    .sort({ reviewedAt: 1 })
    .lean();

  return success(res, reviews, "Review history retrieved");
});

/**
 * Escape a single CSV field per RFC 4180
 */
const csvField = (value) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Export publications as CSV with dynamic filters
 * GET /api/v1/publications/export
 * Admin only
 *
 * Supported query params:
 *  - timeframe: '3m' | '6m' | '12m' | '24m' | 'all' | 'custom'  (default 'all')
 *  - dateFrom, dateTo: ISO dates, used when timeframe='custom' (inclusive)
 *  - dateField: 'createdAt' | 'publicationDate'  (default 'createdAt')
 *  - departmentId: single id or comma-separated ids
 *  - campus: single value or comma-separated values (e.g. "Sahiwal,Islamabad")
 *  - status: single value or comma-separated values
 *  - publicationType: single value or comma-separated values
 *  - yearFrom, yearTo: numeric publication-year range
 *  - search: free-text match on title/abstract/keywords
 */
const exportPublicationsCsv = catchAsync(async (req, res) => {
  const {
    timeframe = "all",
    dateFrom,
    dateTo,
    dateField = "createdAt",
    departmentId,
    campus,
    status,
    publicationType,
    yearFrom,
    yearTo,
    search,
  } = req.query;

  const allowedDateFields = ["createdAt", "publicationDate"];
  const resolvedDateField = allowedDateFields.includes(dateField) ? dateField : "createdAt";

  const query = {};

  // --- Dynamic time frame ---
  const timeframeMonthsMap = { "3m": 3, "6m": 6, "12m": 12, "24m": 24 };
  if (timeframe === "custom" && (dateFrom || dateTo)) {
    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
      throw new BadRequestError('The "From" date must be before the "To" date.');
    }
    query[resolvedDateField] = {};
    if (dateFrom) query[resolvedDateField].$gte = new Date(dateFrom);
    if (dateTo) query[resolvedDateField].$lte = new Date(dateTo);
  } else if (timeframeMonthsMap[timeframe]) {
    const since = new Date();
    since.setMonth(since.getMonth() - timeframeMonthsMap[timeframe]);
    query[resolvedDateField] = { $gte: since };
  }
  // timeframe === 'all' (or unrecognised) -> no date filter

  // --- Status filter (comma-separated allowed) ---
  // Drafts are private, unfinished work belonging to their authors and are
  // never exportable by an admin — always excluded, even if requested.
  if (status) {
    const statuses = String(status)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s !== "draft");
    query.status = statuses.length ? { $in: statuses } : { $ne: "draft" };
  } else {
    query.status = { $ne: "draft" };
  }

  // --- Publication type filter (comma-separated allowed) ---
  if (publicationType) {
    const types = String(publicationType).split(",").map((s) => s.trim()).filter(Boolean);
    if (types.length) query.publicationType = { $in: types };
  }

  // --- Year range ---
  if (yearFrom || yearTo) {
    if (yearFrom && yearTo && parseInt(yearFrom, 10) > parseInt(yearTo, 10)) {
      throw new BadRequestError('"Year from" must be less than or equal to "Year to".');
    }
    query.year = {};
    if (yearFrom) query.year.$gte = parseInt(yearFrom, 10);
    if (yearTo) query.year.$lte = parseInt(yearTo, 10);
  }

  // --- Department filter (comma-separated allowed) ---
  let departmentIds = departmentId
    ? String(departmentId).split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  // --- Campus filter: resolve to department ids, intersect with departmentId if both given ---
  if (campus) {
    const campuses = String(campus).split(",").map((s) => s.trim()).filter(Boolean);
    const campusDepartments = await Department.find({ campus: { $in: campuses } }).select("_id");
    const campusDeptIds = campusDepartments.map((d) => d._id.toString());
    departmentIds = departmentIds
      ? departmentIds.filter((id) => campusDeptIds.includes(id))
      : campusDeptIds;
  }
  if (departmentIds) {
    query.departmentId = { $in: departmentIds };
  }

  // --- Free-text search ---
  if (search) {
    query.$text = { $search: search };
  }

  const publications = await Publication.find(query)
    .populate("submittedBy", "name email")
    .populate("departmentId", "name campus")
    .populate("authors.authorId", "name email")
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    "Title",
    "Publication Type",
    "Status",
    "Year",
    "Department",
    "Campus",
    "Venue",
    "Venue Type",
    "DOI",
    "Citation Count",
    "Authors",
    "Submitted By",
    "Submitted By Email",
    "Submitted On",
    "Publication Date",
  ];

  const rows = publications.map((pub) => {
    const authorNames = (pub.authors || [])
      .map((a) => a.externalName || a.authorId?.name || "")
      .filter(Boolean)
      .join("; ");

    return [
      pub.title || "",
      (pub.publicationType || "").replace(/_/g, " "),
      pub.status || "",
      pub.year || "",
      pub.departmentId?.name || "",
      pub.departmentId?.campus || "",
      pub.venue?.name || "",
      pub.venue?.type || "",
      pub.doi || "",
      pub.citationCount || 0,
      authorNames,
      pub.submittedBy?.name || "",
      pub.submittedBy?.email || "",
      pub.createdAt ? new Date(pub.createdAt).toISOString().slice(0, 10) : "",
      pub.publicationDate ? new Date(pub.publicationDate).toISOString().slice(0, 10) : "",
    ].map(csvField).join(",");
  });

  const csv = [headers.map(csvField).join(","), ...rows].join("\r\n");
  const filename = `publications-export-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

module.exports = {
  createPublication,
  updatePublication,
  submitPublication,
  resubmitPublication,
  hodReview,
  oricReview,
  listPublications,
  getPublication,
  deletePublication,
  updateMetadata,
  uploadPdf,
  getDownloadUrl,
  getReviews,
  exportPublicationsCsv,
};