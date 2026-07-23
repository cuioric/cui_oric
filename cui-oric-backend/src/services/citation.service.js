/**
 * Citation Service
 * Manages citation relationships and updates citation counts
 */

const Citation = require('../models/Citation');
const Publication = require('../models/Publication');
const logger = require('../config/logger');

/**
 * Add a citation (internal or external)
 * @param {Object} data - Citation data
 * @returns {Promise<Object>} Created citation
 */
const addCitation = async (data) => {
  const { citingPaperId, citedPaperId, citingPaperExternal } = data;

  // Validate cited paper exists and is verified
  const citedPaper = await Publication.findById(citedPaperId).select('status citationCount');
  if (!citedPaper) {
    throw new Error('Cited paper not found');
  }

  if (citedPaper.status !== 'oric_verified') {
    throw new Error('Can only cite verified publications');
  }

  // If internal citing paper, validate it
  if (citingPaperId) {
    const citingPaper = await Publication.findById(citingPaperId).select('status');
    if (!citingPaper) {
      throw new Error('Citing paper not found');
    }
    if (citingPaper.status !== 'oric_verified') {
      throw new Error('Citing paper must be verified');
    }
    if (citingPaperId.toString() === citedPaperId.toString()) {
      throw new Error('A paper cannot cite itself');
    }
  }

  // Validate external citation has required fields
  if (!citingPaperId && citingPaperExternal) {
    if (!citingPaperExternal.title) {
      throw new Error('External citation must have a title');
    }
  }

  // Create citation record
  const citation = await Citation.addCitation({
    citingPaperId,
    citedPaperId,
    citingPaperExternal,
  });

  logger.info(`Citation added: ${citingPaperId || 'external'} -> ${citedPaperId}`);

  return citation;
};

/**
 * Get citation graph for a publication (incoming + outgoing)
 * @param {string} publicationId - Publication ObjectId
 * @returns {Promise<Object>} Citation graph
 */
const getCitationGraph = async (publicationId) => {
  return Citation.getCitationGraph(publicationId);
};

/**
 * Get incoming citations (papers that cite this paper)
 * @param {string} publicationId - Publication ObjectId
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated incoming citations
 */
const getIncomingCitations = async (publicationId, options = {}) => {
  const { page = 1, limit = 20 } = options;

  const [citations, total] = await Promise.all([
    Citation.find({ citedPaperId: publicationId })
      .populate('citingPaperId', 'title year authors venue.name citationCount')
      .sort({ addedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Citation.countDocuments({ citedPaperId: publicationId }),
  ]);

  return {
    data: citations.map((c) => ({
      citationId: c._id,
      paper: c.citingPaperId || c.citingPaperExternal,
      isInternal: !!c.citingPaperId,
      addedAt: c.addedAt,
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get outgoing citations (papers this paper cites)
 * @param {string} publicationId - Publication ObjectId
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated outgoing citations
 */
const getOutgoingCitations = async (publicationId, options = {}) => {
  const { page = 1, limit = 20 } = options;

  const [citations, total] = await Promise.all([
    Citation.find({ citingPaperId: publicationId })
      .populate('citedPaperId', 'title year authors venue.name citationCount')
      .sort({ addedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Citation.countDocuments({ citingPaperId: publicationId }),
  ]);

  return {
    data: citations.map((c) => ({
      citationId: c._id,
      paper: c.citedPaperId,
      isInternal: true,
      addedAt: c.addedAt,
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Recompute citation count for a publication
 * @param {string} publicationId - Publication ObjectId
 * @returns {Promise<number>} Updated citation count
 */
const recomputeCitationCount = async (publicationId) => {
  return Citation.recomputeCitationCount(publicationId);
};

/**
 * Delete a citation
 * @param {string} citationId - Citation ObjectId
 * @returns {Promise<void>}
 */
const deleteCitation = async (citationId) => {
  const citation = await Citation.findById(citationId);
  if (!citation) {
    throw new Error('Citation not found');
  }

  const { citingPaperId, citedPaperId } = citation;

  // Delete citation record
  await Citation.findByIdAndDelete(citationId);

  // Decrement cited paper's citation count
  await Publication.findByIdAndUpdate(citedPaperId, {
    $inc: { citationCount: -1 },
    $pull: { citedByIds: citingPaperId },
  });

  // Remove from citing paper's citedByIds if internal
  if (citingPaperId) {
    await Publication.findByIdAndUpdate(citingPaperId, {
      $pull: { citedByIds: citedPaperId },
    });
  }

  logger.info(`Citation deleted: ${citationId}`);
};

/**
 * Bulk add citations (for import)
 * @param {Array} citations - Array of citation data
 * @returns {Promise<Object>} Results
 */
const bulkAddCitations = async (citations) => {
  const results = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  for (const citationData of citations) {
    try {
      await addCitation(citationData);
      results.successful++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        data: citationData,
        error: error.message,
      });
    }
  }

  return results;
};

/**
 * Get citation statistics for a department
 * @param {string} departmentId - Department ObjectId
 * @returns {Promise<Object>} Citation statistics
 */
const getDepartmentCitationStats = async (departmentId) => {
  // Get all verified publications in department
  const publications = await Publication.find({
    departmentId,
    status: 'oric_verified',
  }).select('_id citationCount');

  const pubIds = publications.map((p) => p._id);
  const totalCitations = publications.reduce((sum, p) => sum + (p.citationCount || 0), 0);

  // Get incoming citations from external sources
  const externalCitations = await Citation.countDocuments({
    citedPaperId: { $in: pubIds },
    citingPaperId: null,
  });

  // Get internal citations between department papers
  const internalCitations = await Citation.countDocuments({
    citedPaperId: { $in: pubIds },
    citingPaperId: { $in: pubIds },
  });

  // Get outgoing citations
  const outgoingCitations = await Citation.countDocuments({
    citingPaperId: { $in: pubIds },
  });

  return {
    totalPublications: publications.length,
    totalCitations,
    externalCitations,
    internalCitations,
    outgoingCitations,
    averageCitationsPerPaper: publications.length > 0 ? totalCitations / publications.length : 0,
  };
};

/**
 * Get top cited publications
 * @param {Object} filter - Filter options (departmentId, year, etc.)
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} Top cited publications
 */
const getTopCitedPublications = async (filter = {}, limit = 10) => {
  const query = { status: 'oric_verified', ...filter };
  return Publication.find(query)
    .select('title year authors venue.name citationCount doi')
    .sort({ citationCount: -1 })
    .limit(limit)
    .lean();
};

const citationService = {
  addCitation,
  getCitationGraph,
  getIncomingCitations,
  getOutgoingCitations,
  recomputeCitationCount,
  deleteCitation,
  bulkAddCitations,
  getDepartmentCitationStats,
  getTopCitedPublications,
};

module.exports = { citationService, ...citationService };