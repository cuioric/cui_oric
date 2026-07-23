/**
 * Department Routes
 * Public listing and admin management
 */

const express = require('express');
const router = express.Router();

const departmentController = require('../controllers/department.controller');
const { validateCreateDepartment, validateUpdateDepartment, validateMongoId, validatePagination } = require('../middleware/validate');
const { apiLimiter, adminLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireOricAdmin } = require('../middleware/rbac');
const { optionalAuth } = require('../middleware/auth');


router.use(optionalAuth);

// Public routes (for search/discovery)
router.get('/', apiLimiter, validatePagination, departmentController.listDepartments);
router.get('/:id', validateMongoId('id'), apiLimiter, departmentController.getDepartment);

// Admin routes
router.post('/', adminLimiter, requireOricAdmin, validateCreateDepartment, departmentController.createDepartment);
router.patch('/:id', validateMongoId('id'), adminLimiter, requireOricAdmin, validateUpdateDepartment, departmentController.updateDepartment);
router.delete('/:id', validateMongoId('id'), adminLimiter, requireOricAdmin, departmentController.deleteDepartment);
router.get('/:id/stats', validateMongoId('id'), adminLimiter, requireOricAdmin, departmentController.getDepartmentStats);

module.exports = router;