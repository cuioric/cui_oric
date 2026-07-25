/**
 * Analytics & Dashboard Routes
 * Institution-wide and department-scoped statistics
 */

const express = require('express');
const router = express.Router();

const analyticsController = require('../controllers/analytics.controller');
const { apiLimiter, adminLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireOricAdmin, requireHod } = require('../middleware/rbac');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(apiLimiter, authenticate, requireAuth);

// Institution dashboard (ORIC Admin)
router.get('/institution', adminLimiter, requireOricAdmin, analyticsController.getInstitutionDashboard);

// Department dashboard (HOD)
router.get('/department', requireHod, analyticsController.getDepartmentDashboard);

// Moderation dashboards
router.get('/moderation/stage1', adminLimiter, requireOricAdmin, analyticsController.getStage1Moderation);
router.get('/moderation/stage2', adminLimiter, requireOricAdmin, analyticsController.getStage2Moderation);

// Research interest analytics
router.get('/research-interests', adminLimiter, requireOricAdmin, analyticsController.getResearchInterestAnalytics);

// Collaboration analytics
router.get('/collaborations', adminLimiter, requireOricAdmin, analyticsController.getCollaborationAnalytics);

// Maintenance: rebuild CoAuthorNetwork from all verified publications (ORIC Admin only)
router.post('/rebuild-coauthor-network', adminLimiter, requireOricAdmin, analyticsController.rebuildCoAuthorNetwork);

module.exports = router;