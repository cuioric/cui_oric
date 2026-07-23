/**
 * Authentication Routes
 * Public routes for registration, login, password reset
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const {
  validateRegister,
  validateLogin,
  validateVerifyEmail,
  validateForgotPassword,
  validateResetPassword,
  validateRefreshToken,
} = require('../middleware/validate');
const { authLimiter, passwordResetLimiter, emailVerificationLimiter } = require('../middleware/rateLimit');
const { authenticate, optionalAuth } = require('../middleware/auth');

// Public routes with rate limiting
router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);
router.post('/refresh', validateRefreshToken, authController.refreshToken);
router.get('/verify-email/:token', emailVerificationLimiter, validateVerifyEmail, authController.verifyEmail);
router.post('/resend-verification', emailVerificationLimiter, validateForgotPassword, authController.resendVerification);
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, validateResetPassword, authController.resetPassword);

// Protected routes — require a valid, active-user token (was incorrectly using
// optionalAuth, which lets requests through with req.user undefined and made
// these routes throw a raw 500 instead of a clean 401 when unauthenticated)
router.get('/me', authenticate, authController.getMe);
router.patch('/me', authenticate, authController.updateMe);
router.patch('/change-password', authenticate, authController.changePassword);
// logout stays optional: it should succeed even if the access token already expired,
// as long as it can still clear the refresh cookie
router.post('/logout', optionalAuth, authController.logout);

module.exports = router;