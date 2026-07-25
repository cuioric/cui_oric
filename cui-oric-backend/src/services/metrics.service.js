/**
 * Metrics Service
 * Recomputes author metrics (h-index, i10-index, citations) from verified publications
 * Updates co-author network denormalization
 */

const Publication = require("../models/Publication");
const AuthorProfile = require("../models/AuthorProfile");
const CoAuthorNetwork = require("../models/CoAuthorNetwork");
const ResearchInterest = require("../models/ResearchInterest");
const logger = require("../config/logger");

/**
 * Recompute metrics for a single author
 * @param {string} authorProfileId - AuthorProfile ObjectId
 * @returns {Promise<Object>} Updated metrics
 */
const recomputeAuthorMetrics = async (authorProfileId) => {
  const profile =
    await AuthorProfile.findById(authorProfileId).populate("userId");
  if (!profile) {
    throw new Error("Author profile not found");
  }
  if (!profile.userId) {
    // Orphaned profile: linked User no longer exists — bail instead of crashing below
    logger.warn(
      `Skipping metrics recompute: AuthorProfile ${authorProfileId} has no linked user (orphaned)`,
    );
    return profile.metrics;
  }

  // Get all verified publications where this author is listed
  const publications = await Publication.find({
    "authors.authorId": profile.userId._id,
    status: "oric_verified",
  })
    .select("_id citationCount year citedByIds authors")
    .lean();

  if (publications.length === 0) {
    // No verified publications - reset metrics
    profile.metrics = {
      totalCitations: 0,
      hIndex: 0,
      i10Index: 0,
      citationsSince5Years: 0,
      hIndexSince5Years: 0,
      i10IndexSince5Years: 0,
      lastCalculatedAt: new Date(),
    };
    profile.coAuthors = [];
    await profile.save({ validateBeforeSave: false });
    return profile.metrics;
  }

  const pubIds = publications.map((p) => p._id);
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const currentYear = new Date().getFullYear();

  // Calculate total citations
  const totalCitations = publications.reduce(
    (sum, p) => sum + (p.citationCount || 0),
    0,
  );

  // Calculate h-index
  const citationCounts = publications
    .map((p) => p.citationCount || 0)
    .sort((a, b) => b - a);

  let hIndex = 0;
  for (let i = 0; i < citationCounts.length; i++) {
    if (citationCounts[i] >= i + 1) hIndex = i + 1;
    else break;
  }

  // Calculate i10-index
  const i10Index = citationCounts.filter((c) => c >= 10).length;

  // 5-year metrics
  const recentPublications = publications.filter(
    (p) => p.year && p.year >= fiveYearsAgo.getFullYear(),
  );
  const recentCitationCounts = recentPublications
    .map((p) => p.citationCount || 0)
    .sort((a, b) => b - a);

  const citationsSince5Years = recentPublications.reduce(
    (sum, p) => sum + (p.citationCount || 0),
    0,
  );

  let hIndexSince5Years = 0;
  for (let i = 0; i < recentCitationCounts.length; i++) {
    if (recentCitationCounts[i] >= i + 1) hIndexSince5Years = i + 1;
    else break;
  }

  const i10IndexSince5Years = recentCitationCounts.filter(
    (c) => c >= 10,
  ).length;

  // Update profile metrics
  profile.metrics = {
    totalCitations,
    hIndex,
    i10Index,
    citationsSince5Years,
    hIndexSince5Years,
    i10IndexSince5Years,
    lastCalculatedAt: new Date(),
  };

  // Recompute co-authors from publications (denormalized)
  const coAuthorMap = new Map();

  for (const pub of publications) {
    for (const author of pub.authors) {
      if (
        author.authorId &&
        author.authorId.toString() !== profile.userId._id.toString()
      ) {
        const key = author.authorId.toString();
        if (!coAuthorMap.has(key)) {
          // Get co-author's profile
          const coAuthorProfile = await AuthorProfile.findOne({
            userId: author.authorId,
          })
            .select("_id userId")
            .lean();

          if (coAuthorProfile) {
            coAuthorMap.set(key, {
              authorId: coAuthorProfile._id,
              sharedPublications: 0,
            });
          }
        }

        if (coAuthorMap.has(key)) {
          coAuthorMap.get(key).sharedPublications += 1;
        }
      }
    }
  }

  // Sort by shared publications descending
  profile.coAuthors = Array.from(coAuthorMap.values()).sort(
    (a, b) => b.sharedPublications - a.sharedPublications,
  );

  await profile.save({ validateBeforeSave: false });

  logger.info(
    `Metrics recomputed for author ${authorProfileId}: h-index=${hIndex}, i10=${i10Index}, citations=${totalCitations}`,
  );

  return profile.metrics;
};

/**
 * Recompute metrics for all authors in a department
 * @param {string} departmentId - Department ObjectId
 * @returns {Promise<number>} Number of authors updated
 */
const recomputeDepartmentMetrics = async (departmentId) => {
  const profiles = await AuthorProfile.find({ departmentId })
    .select("_id")
    .lean();

  let updated = 0;
  for (const profile of profiles) {
    try {
      await recomputeAuthorMetrics(profile._id);
      updated++;
    } catch (error) {
      logger.error(
        `Failed to recompute metrics for ${profile._id}:`,
        error.message,
      );
    }
  }

  logger.info(
    `Department metrics recomputed: ${updated}/${profiles.length} authors updated`,
  );
  return updated;
};

/**
 * Recompute co-author network for a publication
 * @param {string} publicationId - Publication ObjectId
 * @returns {Promise<void>}
 */
const recomputePublicationCoAuthors = async (publicationId) => {
  const publication = await Publication.findById(publicationId)
    .select("authors year")
    .lean();

  if (!publication || publication.status !== "oric_verified") return;

  const internalAuthorUserIds = publication.authors
    .filter((a) => a.authorId)
    .map((a) => a.authorId.toString());

  // CoAuthorNetwork.authorId/coAuthorId reference AuthorProfile, not User —
  // Publication.authors[].authorId is a User id, so it must be translated
  // to the matching AuthorProfile._id before recording a collaboration.
  const profiles = await AuthorProfile.find({
    userId: { $in: internalAuthorUserIds },
  })
    .select("_id userId")
    .lean();
  const userIdToProfileId = new Map(
    profiles.map((p) => [p.userId.toString(), p._id.toString()]),
  );
  const internalAuthors = internalAuthorUserIds
    .map((userId) => userIdToProfileId.get(userId))
    .filter(Boolean);

  // Create pairs for all combinations
  for (let i = 0; i < internalAuthors.length; i++) {
    for (let j = i + 1; j < internalAuthors.length; j++) {
      const [a1, a2] = [internalAuthors[i], internalAuthors[j]].sort();
      await CoAuthorNetwork.recordCollaboration(
        a1,
        a2,
        publicationId,
        publication.year,
      );
    }
  }
};

/**
 * Rebuild entire co-author network from all verified publications
 * @returns {Promise<Object>} Rebuild statistics
 */
const rebuildCoAuthorNetwork = async () => {
  logger.info("Starting full co-author network rebuild");

  // Clear existing network
  await CoAuthorNetwork.deleteMany({});

  // Get all verified publications
  const publications = await Publication.find({ status: "oric_verified" })
    .select("_id year authors")
    .lean();

  // CoAuthorNetwork.authorId/coAuthorId reference AuthorProfile, not User —
  // Publication.authors[].authorId is a User id. Build one User->AuthorProfile
  // map up front (instead of querying per publication) so every publication
  // below can translate its author User ids to the correct AuthorProfile ids.
  const allProfiles = await AuthorProfile.find({})
    .select("_id userId")
    .lean();
  const userIdToProfileId = new Map(
    allProfiles.map((p) => [p.userId.toString(), p._id.toString()]),
  );

  let processed = 0;
  const operations = [];

  for (const pub of publications) {
    const internalAuthors = pub.authors
      .filter((a) => a.authorId)
      .map((a) => userIdToProfileId.get(a.authorId.toString()))
      .filter(Boolean);

    for (let i = 0; i < internalAuthors.length; i++) {
      for (let j = i + 1; j < internalAuthors.length; j++) {
        const [a1, a2] = [internalAuthors[i], internalAuthors[j]].sort();
        operations.push({
          updateOne: {
            filter: { authorId: a1, coAuthorId: a2 },
            update: {
              $inc: { collaborationCount: 1 },
              $addToSet: { sharedPublicationIds: pub._id },
              $min: { firstCollaborationYear: pub.year },
              $max: { lastCollaborationYear: pub.year },
            },
            upsert: true,
          },
        });
      }
    }
    processed++;
  }

  if (operations.length > 0) {
    await CoAuthorNetwork.bulkWrite(operations, { ordered: false });
  }

  logger.info(
    `Co-author network rebuilt: ${processed} publications, ${operations.length} operations`,
  );
  return { processed, operations: operations.length };
};

/**
 * Update research interest follower counts
 * @returns {Promise<void>}
 */
const updateResearchInterestFollowers = async () => {
  const profiles = await AuthorProfile.find({
    researchInterests: { $exists: true, $ne: [] },
  })
    .select("researchInterests")
    .lean();

  const tagCounts = {};

  for (const profile of profiles) {
    for (const tag of profile.researchInterests) {
      const normalized = tag.toLowerCase().trim();
      tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
    }
  }

  // Update or create tags
  const operations = Object.entries(tagCounts).map(([tag, count]) => ({
    updateOne: {
      filter: { tag },
      update: { $set: { followerCount: count } },
      upsert: true,
    },
  }));

  if (operations.length > 0) {
    await ResearchInterest.bulkWrite(operations, { ordered: false });
  }

  logger.info(`Research interest followers updated: ${operations.length} tags`);
};

/**
 * Trigger async metrics recomputation after publication verification
 * @param {string} publicationId - Publication ObjectId
 * @returns {Promise<void>}
 */
const triggerPostVerificationMetrics = async (publicationId) => {
  // Run asynchronously - don't await
  setImmediate(async () => {
    try {
      // Recompute co-author network for this publication
      await recomputePublicationCoAuthors(publicationId);

      // Recompute metrics for all internal authors
      const publication = await Publication.findById(publicationId)
        .select("authors")
        .lean();
      if (publication) {
        const authorIds = publication.authors
          .filter((a) => a.authorId)
          .map((a) => a.authorId);

        for (const authorId of authorIds) {
          const profile = await AuthorProfile.findOne({ userId: authorId })
            .select("_id")
            .lean();
          if (profile) {
            await recomputeAuthorMetrics(profile._id);
          }
        }
      }

      // Update citation counts (handled by citation service)
    } catch (error) {
      logger.error("Post-verification metrics update failed:", error);
    }
  });
};

const metricsService = {
  recomputeAuthorMetrics,
  recomputeDepartmentMetrics,
  recomputePublicationCoAuthors,
  rebuildCoAuthorNetwork,
  updateResearchInterestFollowers,
  triggerPostVerificationMetrics,
};

module.exports = { metricsService, ...metricsService };