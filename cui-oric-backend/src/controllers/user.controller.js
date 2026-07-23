/**
 * User Controller (Admin)
 * ORIC Admin user management: list pending, approve/reject, delete, assign HOD
 */

const User = require('../models/User');
const Department = require('../models/Department');
const AuthorProfile = require('../models/AuthorProfile');
const emailService = require('../services/email.service');
const catchAsync = require('../utils/catchAsync');
const {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} = require('../utils/AppError');
const { success, paginationMeta } = require('../utils/apiResponse');
const { escapeRegex } = require('../utils/escapeRegex');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * List pending users (awaiting ORIC approval)
 * GET /api/v1/admin/users/pending
 */
const listPendingUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const users = await User.find({ status: 'pending_oric_approval' })
    .select('-password -refreshTokenHash -emailVerificationToken -passwordResetToken')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await User.countDocuments({ status: 'pending_oric_approval' });

  return success(res, users, 'Pending users retrieved', paginationMeta(page, limit, total));
});

/**
 * List all users with filters
 * GET /api/v1/admin/users
 */
const listUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, role, departmentId, search } = req.query;

  const query = {};

  if (status) query.status = status;
  if (role) query.role = role;
  if (departmentId) query.departmentId = departmentId;
  if (search) {
    query.$or = [
      { name: { $regex: escapeRegex(search), $options: 'i' } },
      { email: { $regex: escapeRegex(search), $options: 'i' } },
    ];
  }

  const users = await User.find(query)
    .select('-password -refreshTokenHash -emailVerificationToken -passwordResetToken')
    .populate('departmentId', 'name campus')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await User.countDocuments(query);

  return success(res, users, 'Users retrieved', paginationMeta(page, limit, total));
});

/**
 * Get user by ID
 * GET /api/v1/admin/users/:id
 */
const getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password -refreshTokenHash -emailVerificationToken -passwordResetToken')
    .populate('departmentId', 'name campus hodId')
    .lean();

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Also get author profile if exists
  const authorProfile = await AuthorProfile.findOne({ userId: user._id }).lean();
  if (authorProfile) {
    user.authorProfile = authorProfile;
  }

  return success(res, user, 'User retrieved');
});

/**
 * Approve pending user (ORIC Admin)
 * PATCH /api/v1/admin/users/:id/approve
 */
const approveUser = catchAsync(async (req, res) => {
  const { departmentId, role } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.status !== 'pending_oric_approval') {
    throw new BadRequestError('User is not pending approval');
  }

  // Validate department exists
  const department = await Department.findById(departmentId);
  if (!department) {
    throw new NotFoundError('Department not found');
  }

  // Validate role
  const allowedRoles = ['hod', 'faculty', 'ms_student', 'phd_student'];
  if (!allowedRoles.includes(role)) {
    throw new BadRequestError('Invalid role for approval');
  }

  // If role is HOD, check department doesn't already have a HOD
  if (role === 'hod' && department.hodId) {
    throw new ConflictError('Department already has a HOD assigned');
  }

  // Update user
  user.status = 'active';
  user.departmentId = departmentId;
  user.role = role;
  await user.save();

  // If HOD, assign to department
  if (role === 'hod') {
    department.hodId = user._id;
    await department.save();
  }

  // Create author profile
  await AuthorProfile.create({
    userId: user._id,
    departmentId,
    designation: role === 'hod' ? 'Head of Department' : role.replace('_', ' '),
    affiliation: 'COMSATS University Islamabad, Sahiwal Campus',
    verifiedEmail: true,
  });

  // Send approval email
  emailService
    .sendTemplatedEmail(user.email, user.name, 'accountApproved')
    .catch((err) => logger.error('Failed to send approval email:', err));

  return success(res, { userId: user._id, status: user.status }, 'User approved successfully');
});

/**
 * Reject pending user (ORIC Admin)
 * PATCH /api/v1/admin/users/:id/reject
 */
const rejectUser = catchAsync(async (req, res) => {
  const { remarks } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.status !== 'pending_oric_approval') {
    throw new BadRequestError('User is not pending approval');
  }

  user.status = 'suspended'; // Or could delete, but suspend preserves audit trail
  await user.save();

  return success(res, { userId: user._id, status: user.status }, 'User rejected');
});

/**
 * Update user (Admin)
 * PATCH /api/v1/admin/users/:id
 */
const updateUser = catchAsync(async (req, res) => {
  const { name, role, status, departmentId } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Prevent self-demotion for oric_admin
  if (user._id.toString() === req.user._id.toString() && role && role !== 'oric_admin') {
    throw new ForbiddenError('Cannot change your own admin role');
  }

  // Validate department if provided
  if (departmentId) {
    const department = await Department.findById(departmentId);
    if (!department) {
      throw new NotFoundError('Department not found');
    }
  }

  // If changing to HOD role, check department
  if (role === 'hod' && departmentId) {
    const department = await Department.findById(departmentId);
    if (department.hodId && department.hodId.toString() !== user._id.toString()) {
      throw new ConflictError('Department already has a HOD');
    }
  }

  // If removing HOD role, clear department HOD (only when role is being
  // explicitly changed away from 'hod' — not when role is simply omitted
  // from the request, which previously wiped the department's HOD by mistake)
  if (user.role === 'hod' && role !== undefined && role !== 'hod') {
    await Department.findOneAndUpdate({ hodId: user._id }, { hodId: null });
  }

  // If assigning HOD role, update department
  if (role === 'hod' && departmentId) {
    await Department.findByIdAndUpdate(departmentId, { hodId: user._id });
  }

  // Update fields
  if (name) user.name = name;
  if (role) user.role = role;
  if (status) user.status = status;
  if (departmentId !== undefined) user.departmentId = departmentId;

  // oric_admin must always have a null departmentId (enforced by the User model
  // validator) — auto-clear it here so promoting someone to oric_admin doesn't
  // fail validation just because the caller forgot to also send departmentId: null
  if (user.role === 'oric_admin') {
    user.departmentId = null;
  }

  await user.save();

  return success(res, user, 'User updated');
});

/**
 * Delete user (Admin)
 * DELETE /api/v1/admin/users/:id
 */
const deleteUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Prevent self-deletion
  if (user._id.toString() === req.user._id.toString()) {
    throw new ForbiddenError('Cannot delete your own account');
  }

  // If HOD, clear department HOD reference
  if (user.role === 'hod') {
    await Department.findOneAndUpdate({ hodId: user._id }, { hodId: null });
  }

  // Delete author profile
  await AuthorProfile.findOneAndDelete({ userId: user._id });

  // Delete user
  await User.findByIdAndDelete(req.params.id);

  return success(res, null, 'User deleted');
});

/**
 * Assign HOD to department
 * PATCH /api/v1/admin/departments/:id/assign-hod
 */
const assignHod = catchAsync(async (req, res) => {
  const { userId } = req.body;

  const department = await Department.findById(req.params.id);
  if (!department) {
    throw new NotFoundError('Department not found');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.role !== 'hod') {
    throw new BadRequestError('User must have role "hod"');
  }

  if (user.status !== 'active') {
    throw new BadRequestError('User must be active');
  }

  // Check if user already HOD of another department
  const existingHodDept = await Department.findOne({ hodId: userId });
  if (existingHodDept && existingHodDept._id.toString() !== department._id.toString()) {
    throw new ConflictError('User is already HOD of another department');
  }

  // Clear current HOD if any
  if (department.hodId) {
    await User.findByIdAndUpdate(department.hodId, { role: 'faculty' });
  }

  // Assign new HOD
  department.hodId = userId;
  await department.save();

  // Update user's department
  user.departmentId = department._id;
  await user.save();

  // Update author profile
  await AuthorProfile.findOneAndUpdate(
    { userId },
    { departmentId: department._id, designation: 'Head of Department' }
  );

  return success(res, department, 'HOD assigned successfully');
});

module.exports = {
  listPendingUsers,
  listUsers,
  getUser,
  approveUser,
  rejectUser,
  updateUser,
  deleteUser,
  assignHod,
};