/**
 * Authentication Controller
 * Handles registration, login, token refresh, password reset, email verification
 */
const logger = require('../config/logger');
const crypto = require('crypto');
const User = require('../models/User');
const Department = require('../models/Department');
const {
  authenticate,
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} = require('../middleware/auth');
const emailService = require('../services/email.service');
const catchAsync = require('../utils/catchAsync');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../utils/AppError');
const { success } = require('../utils/apiResponse');
const config = require('../config/env');

/**
 * Register a new user
 * POST /api/v1/auth/register
 */
const register = catchAsync(async (req, res) => {
  const { name, email, password, role, campus } = req.body;

  // Check if email already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  // Validate role for registration (only faculty, ms_student, phd_student)
  const allowedRoles = ['faculty', 'ms_student', 'phd_student'];
  if (!allowedRoles.includes(role)) {
    throw new BadRequestError('Invalid role for registration');
  }

  // Create user with pending email verification status
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role,
    campus,
    departmentId: null, // Set at ORIC approval
    status: 'pending_email_verification',
  });

  // Generate email verification token
  const { token, hash } = User.generateEmailVerificationToken();
  user.emailVerificationToken = hash;
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await user.save({ validateBeforeSave: false });

  // Send verification email (non-blocking)
  const verificationUrl = `${config.cors.origin}/verify-email/${token}`;
  emailService
    .sendTemplatedEmail(user.email, user.name, 'emailVerification', verificationUrl)
    .catch((err) => logger.error('Failed to send verification email:', err));

  return success(
    res,
    { userId: user._id, email: user.email },
    'Registration successful. Please check your email to verify your account.',
    null,
    201
  );
});

/**
 * Verify email address
 * GET /api/v1/auth/verify-email/:token
 */
const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.params;

  // Hash the token to compare with stored hash
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: tokenHash,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new BadRequestError('Invalid or expired verification token');
  }

  // Update status to pending ORIC approval
  user.status = 'pending_oric_approval';
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return success(res, null, 'Email verified successfully. Your account is pending ORIC approval.');
});

/**
 * Resend verification email
 * POST /api/v1/auth/resend-verification
 */
const resendVerification = catchAsync(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Don't reveal if email exists
    return success(res, null, 'If the email exists, a verification link has been sent.');
  }

  if (user.status !== 'pending_email_verification') {
    return success(res, null, 'Account is not pending email verification.');
  }

  // Generate new token
  const { token, hash } = User.generateEmailVerificationToken();
  user.emailVerificationToken = hash;
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  const verificationUrl = `${config.cors.origin}/verify-email/${token}`;
  emailService
    .sendTemplatedEmail(user.email, user.name, 'emailVerification', verificationUrl)
    .catch((err) => logger.error('Failed to send verification email:', err));

  return success(res, null, 'Verification email sent.');
});

/**
 * Login user
 * POST /api/v1/auth/login
 */
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // Find user with password and status
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+password +status +failedLoginAttempts +lockUntil +refreshTokenHash'
  );

  // Generic error message for both wrong password and inactive account
  const invalidCredentialsError = () =>
    new UnauthorizedError('Invalid credentials or account not active');

  if (!user) {
    throw invalidCredentialsError();
  }

  // Check if account is locked
  if (user.isLocked) {
    await user.incrementFailedLogins(); // Update lock time
    throw new ForbiddenError('Account temporarily locked. Please try again later.');
  }

  // Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.incrementFailedLogins();
    throw invalidCredentialsError();
  }

  // Check status - only active users can log in
  if (user.status !== 'active') {
    await user.incrementFailedLogins();
    throw invalidCredentialsError();
  }

  // Reset failed login attempts on successful login
  await user.resetFailedLogins();

  // Update last login
  user.lastLoginAt = new Date();
  user.lastLoginIp = req.ip;
  await user.save({ validateBeforeSave: false });

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token hash
  user.refreshTokenHash = refreshToken;
  await user.save({ validateBeforeSave: false });

  // Set refresh token as httpOnly cookie
  setRefreshTokenCookie(res, refreshToken);

  // Return user data (without password)
  const userData = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    campus: user.campus,
    status: user.status,
  };

  return success(res, { user: userData, accessToken }, 'Login successful');
});

/**
 * Refresh access token
 * POST /api/v1/auth/refresh
 */
const refreshToken = catchAsync(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token required');
  }

  // Verify refresh token
  let decoded;
  try {
    decoded = require('jsonwebtoken').verify(refreshToken, config.jwt.refreshSecret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Refresh token expired. Please log in again.', 'REFRESH_TOKEN_EXPIRED');
    }
    throw new UnauthorizedError('Invalid refresh token', 'REFRESH_TOKEN_INVALID');
  }

  // Find user and verify token hash
  const user = await User.findById(decoded.id).select('+refreshTokenHash +status');
  if (!user || user.status !== 'active') {
    throw new UnauthorizedError('User not found or inactive');
  }

  const isValid = await user.compareRefreshToken(refreshToken);
  if (!isValid) {
    throw new UnauthorizedError('Refresh token revoked. Please log in again.', 'REFRESH_TOKEN_REVOKED');
  }

  // Generate new tokens (rotation)
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  // Update refresh token hash
  user.refreshTokenHash = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  // Set new refresh token cookie
  setRefreshTokenCookie(res, newRefreshToken);

  return success(res, { accessToken: newAccessToken }, 'Token refreshed');
});

/**
 * Logout user
 * POST /api/v1/auth/logout
 */
const logout = catchAsync(async (req, res) => {
  // Clear refresh token cookie
  clearRefreshTokenCookie(res);

  // Optionally invalidate refresh token on server
  if (req.user) {
    req.user.refreshTokenHash = null;
    await req.user.save({ validateBeforeSave: false });
  }

  return success(res, null, 'Logged out successfully');
});

/**
 * Forgot password - send reset email
 * POST /api/v1/auth/forgot-password
 */
const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return success to prevent email enumeration
  if (!user) {
    return success(res, null, 'If the email exists, a password reset link has been sent.');
  }

  // Only allow reset for active users
  if (user.status !== 'active') {
    return success(res, null, 'If the email exists, a password reset link has been sent.');
  }

  // Generate reset token
  const { token, hash } = User.generatePasswordResetToken();
  user.passwordResetToken = hash;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${config.cors.origin}/reset-password/${token}`;
  emailService
    .sendTemplatedEmail(user.email, user.name, 'passwordReset', resetUrl)
    .catch((err) => logger.error('Failed to send password reset email:', err));

  return success(res, null, 'If the email exists, a password reset link has been sent.');
});

/**
 * Reset password
 * POST /api/v1/auth/reset-password
 */
const resetPassword = catchAsync(async (req, res) => {
  const { token, password } = req.body;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+password');

  if (!user) {
    throw new BadRequestError('Invalid or expired reset token');
  }

  // Update password
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokenHash = undefined; // Invalidate all refresh tokens
  await user.save(); // Password will be hashed by pre-save hook

  // Clear refresh token cookie
  clearRefreshTokenCookie(res);

  return success(res, null, 'Password reset successful. Please log in with your new password.');
});

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
const getMe = catchAsync(async (req, res) => {
  const user = req.user;

  const userData = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    campus: user.campus,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };

  return success(res, userData, 'Profile retrieved');
});

/**
 * Update current user profile (limited fields)
 * PATCH /api/v1/auth/me
 */
const updateMe = catchAsync(async (req, res) => {
  const allowedFields = ['name', 'campus'];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  }).select('-password -refreshTokenHash');

  return success(res, user, 'Profile updated');
});

/**
 * Change password (for authenticated users)
 * PATCH /api/v1/auth/change-password
 */
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  user.password = newPassword;
  user.refreshTokenHash = undefined; // Invalidate all sessions
  await user.save();

  clearRefreshTokenCookie(res);

  return success(res, null, 'Password changed. Please log in again.');
});

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
  changePassword,
};