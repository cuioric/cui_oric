/**
 * Citation Routes
 * Citation management and citation graph
 */

const express = require('express');
const router = express.Router();

const citationController = require('../controllers/citation.controller');
const { validateAddCitation, validateMongoId, validatePagination } = require('../middleware/validate');
const { apiLimiter, adminLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireOricAdmin } = require('../middleware/rbac');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(apiLimiter, authenticate, requireAuth);

// Add citation
router.post('/citations', requireOricAdmin, validateAddCitation, citationController.addCitation);

// Get citation graph for a publication
router.get('/publications/:id/citations', validateMongoId('id'), citationController.getCitationGraph);

// Get incoming citations
router.get('/publications/:id/citations/incoming', validateMongoId('id'), validatePagination, citationController.getIncomingCitations);

// Get outgoing citations
router.get('/publications/:id/citations/outgoing', validateMongoId('id'), validatePagination, citationController.getOutgoingCitations);

// Delete citation
router.delete('/citations/:id', requireOricAdmin, validateMongoId('id'), citationController.deleteCitation);

// Get top cited publications
router.get('/citations/top', validatePagination, citationController.getTopCited);

// Department citation stats
router.get('/departments/:id/citation-stats', validateMongoId('id'), citationController.getDepartmentCitationStats);

// Bulk add citations (Admin)
router.post('/admin/citations/bulk', adminLimiter, requireOricAdmin, citationController.bulkAddCitations);

module.exports = router;