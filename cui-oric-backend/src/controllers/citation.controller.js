/**
 * Citation Controller
 * Citation management and citation graph
 */

const { citationService } = require('../services/citation.service');
const Publication = require('../models/Publication');
const catchAsync = require('../utils/catchAsync');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../utils/AppError');
const { success, paginationMeta } = require('../utils/apiResponse');

/**
 * Add a citation
 * POST /api/v1/citations
 */
const addCitation = catchAsync(async (req, res) => {
  const { citingPaperId, citedPaperId, citingPaperExternal } = req.body;

  // Validate cited paper exists and is verified
  const citedPaper = await Publication.findById(citedPaperId).select('status');
  if (!citedPaper) {
    throw new NotFoundError('Cited paper not found');
  }
  if (citedPaper.status !== 'oric_verified') {
    throw new BadRequestError('Can only cite verified publications');
  }

  // If internal citing paper, validate
  if (citingPaperId) {
    const citingPaper = await Publication.findById(citingPaperId).select('status');
    if (!citingPaper) {
      throw new NotFoundError('Citing paper not found');
    }
    if (citingPaper.status !== 'oric_verified') {
      throw new BadRequestError('Citing paper must be verified');
    }
    if (citingPaperId === citedPaperId) {
      throw new BadRequestError('A paper cannot cite itself');
    }
  }

  // Check if citation already exists
  const existing = await require('../models/Citation').findOne({
    citingPaperId: citingPaperId || null,
    citedPaperId,
  });
  if (existing) {
    throw new BadRequestError('Citation already exists');
  }

  // citationService.addCitation already refreshes the cited paper's authors'
  // AuthorProfile.metrics internally. Do NOT also call
  // metricsService.triggerPostVerificationMetrics here — besides being a
  // duplicate recompute, that helper also re-runs recomputePublicationCoAuthors,
  // which unconditionally increments CoAuthorNetwork.collaborationCount. That
  // must only ever fire once, at verification time — calling it again on every
  // citation add would inflate co-author collaboration counts every time the
  // paper gets a new citation, even though no new joint publication happened.
  const citation = await citationService.addCitation({
    citingPaperId,
    citedPaperId,
    citingPaperExternal,
  });

  return success(res, citation, 'Citation added', null, 201);
});

/**
 * Get citation graph for a publication
 * GET /api/v1/publications/:id/citations
 */
const getCitationGraph = catchAsync(async (req, res) => {
  const { depth = 1 } = req.query;

  const graph = await citationService.getCitationGraph(req.params.id, parseInt(depth));

  return success(res, graph, 'Citation graph retrieved');
});

/**
 * Get incoming citations (papers citing this paper)
 * GET /api/v1/publications/:id/citations/incoming
 */
const getIncomingCitations = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const result = await citationService.getIncomingCitations(req.params.id, {
    page: parseInt(page),
    limit: parseInt(limit),
  });

  return success(res, result.data, 'Incoming citations retrieved', result.meta);
});

/**
 * Get outgoing citations (papers this paper cites)
 * GET /api/v1/publications/:id/citations/outgoing
 */
const getOutgoingCitations = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const result = await citationService.getOutgoingCitations(req.params.id, {
    page: parseInt(page),
    limit: parseInt(limit),
  });

  return success(res, result.data, 'Outgoing citations retrieved', result.meta);
});

/**
 * Delete a citation
 * DELETE /api/v1/citations/:id
 */
const deleteCitation = catchAsync(async (req, res) => {
  // citationService.deleteCitation already refreshes the cited paper's
  // authors' metrics internally — see note in addCitation above for why we
  // don't also call metricsService.triggerPostVerificationMetrics here.
  await citationService.deleteCitation(req.params.id);

  return success(res, null, 'Citation deleted');
});

/**
 * Get top cited publications
 * GET /api/v1/citations/top
 */
const getTopCited = catchAsync(async (req, res) => {
  const { limit = 10, departmentId, year } = req.query;

  const filter = {};
  if (departmentId) filter.departmentId = departmentId;
  if (year) filter.year = parseInt(year);

  const publications = await citationService.getTopCitedPublications(filter, parseInt(limit));

  return success(res, publications, 'Top cited publications retrieved');
});

/**
 * Get department citation statistics
 * GET /api/v1/departments/:id/citation-stats
 */
const getDepartmentCitationStats = catchAsync(async (req, res) => {
  const stats = await citationService.getDepartmentCitationStats(req.params.id);

  return success(res, stats, 'Department citation statistics retrieved');
});

/**
 * Bulk add citations (Admin)
 * POST /api/v1/admin/citations/bulk
 */
const bulkAddCitations = catchAsync(async (req, res) => {
  const { citations } = req.body;

  if (!Array.isArray(citations) || citations.length === 0) {
    throw new BadRequestError('Citations array is required');
  }

  const result = await citationService.bulkAddCitations(citations);

  return success(res, result, 'Bulk citation import completed');
});

module.exports = {
  addCitation,
  getCitationGraph,
  getIncomingCitations,
  getOutgoingCitations,
  deleteCitation,
  getTopCited,
  getDepartmentCitationStats,
  bulkAddCitations,
};