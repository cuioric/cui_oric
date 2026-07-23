/**
 * User Management Routes (Admin)
 * ORIC Admin only routes for user approval and management
 */

const express = require('express');
const router = express.Router();

const userController = require('../controllers/user.controller');
const { validateApproveUser, validateUpdateUser, validateMongoId, validatePagination } = require('../middleware/validate');
const { adminLimiter } = require('../middleware/rateLimit');
const { requireOricAdmin, requireUserManagementAccess } = require('../middleware/rbac');
const { authenticate } = require('../middleware/auth');

// All routes require oric_admin
router.use(adminLimiter, authenticate, requireOricAdmin);

// Pending users
router.get('/pending', validatePagination, userController.listPendingUsers);

// All users with filters
router.get('/', validatePagination, userController.listUsers);

// Get user by ID
router.get('/:id', validateMongoId('id'), requireUserManagementAccess, userController.getUser);

// Approve pending user
router.patch('/:id/approve', validateMongoId('id'), validateApproveUser, userController.approveUser);

// Reject pending user
router.patch('/:id/reject', validateMongoId('id'), userController.rejectUser);

// Update user
router.patch('/:id', validateMongoId('id'), validateUpdateUser, requireUserManagementAccess, userController.updateUser);

// Delete user
router.delete('/:id', validateMongoId('id'), requireUserManagementAccess, userController.deleteUser);

// Assign HOD to department
router.patch('/departments/:id/assign-hod', validateMongoId('id'), userController.assignHod);

module.exports = router;