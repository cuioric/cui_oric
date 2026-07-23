/**
 * Search Routes
 * Full-text search and discovery
 */

const express = require('express');
const router = express.Router();

const searchController = require('../controllers/search.controller');
const { validatePublicationSearch, validateMongoId, validatePagination } = require('../middleware/validate');
const { searchLimiter, apiLimiter } = require('../middleware/rateLimit');
const { optionalAuth } = require('../middleware/auth');

// All search routes use search limiter
router.use(searchLimiter);

// Public search (works with or without auth)
router.get('/publications', optionalAuth, validatePublicationSearch, searchController.searchPublications);
router.get('/suggestions', optionalAuth, validatePagination, searchController.getSuggestions);
router.get('/filters', optionalAuth, searchController.getFilters);

// Advanced search (POST for complex queries) — page/limit come from the
// request body here, not the query string, so validatePagination (which
// only checks req.query) doesn't apply; body values already keep their
// JSON type when the client sends proper numbers.
router.post('/advanced', optionalAuth, searchController.advancedSearch);

module.exports = router;