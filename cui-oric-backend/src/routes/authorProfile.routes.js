const express = require('express');
const router = express.Router();

const authorProfileController = require('../controllers/authorProfile.controller');
const { validateUpdateAuthorProfile, validateMongoId, validatePagination } = require('../middleware/validate');
const { apiLimiter, uploadLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireAuthor } = require('../middleware/rbac');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { handleAvatarUpload } = require('../middleware/upload');
const { virusScanMiddleware } = require('../middleware/virusScan');

router.use(apiLimiter); // rate limit on all author profile routes

// Authenticated-only routes
router.get('/me', authenticate, requireAuth, authorProfileController.getMyProfile);
router.patch('/me', authenticate, requireAuth, validateUpdateAuthorProfile, authorProfileController.updateMyProfile);
router.post('/me/photo', authenticate, requireAuth, uploadLimiter, handleAvatarUpload, virusScanMiddleware, authorProfileController.uploadPhoto);
router.delete('/me/photo', authenticate, requireAuth, authorProfileController.deletePhoto);
router.post('/me/recompute-metrics', authenticate, requireAuth, authorProfileController.recomputeMetrics);
router.get('/me/co-authors', authenticate, requireAuth, authorProfileController.getCoAuthors);
router.get('/me/network', authenticate, requireAuth, authorProfileController.getNetwork);
router.get('/me/metrics-summary', authenticate, requireAuth, authorProfileController.getMetricsSummary);

// Public routes (optionalAuth so controller still knows if a user is logged in)
router.get('/:id', validateMongoId('id'), optionalAuth, authorProfileController.getAuthorProfile);
router.get('/', validatePagination, optionalAuth, authorProfileController.listAuthorProfiles);
router.get('/:id/co-authors', validateMongoId('id'), optionalAuth, authorProfileController.getCoAuthors);
router.get('/:id/network', validateMongoId('id'), optionalAuth, authorProfileController.getNetwork);
router.get('/:id/metrics-summary', validateMongoId('id'), optionalAuth, authorProfileController.getMetricsSummary);
router.post('/:id/recompute-metrics', validateMongoId('id'), authenticate, requireAuth, authorProfileController.recomputeMetrics);

module.exports = router;