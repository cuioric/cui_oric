/**
 * Authentication Middleware
 * JWT verification, token extraction, and user attachment
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { UnauthorizedError, ForbiddenError } = require('../utils/AppError');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Extract the access token from the Authorization header.
 * Refresh tokens live in their own httpOnly cookie and are read directly
 * from req.cookies.refreshToken wherever a refresh flow needs them — they
 * are intentionally NOT accepted here, since access and refresh tokens
 * serve different purposes and mixing their extraction caused confusing
 * fallback behavior.
 * @param {Object} req - Express request
 * @returns {string|null} Token or null
 */
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }

  return null;
};

/**
 * Verify JWT access token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('Authentication required. Please log in.');
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.accessSecret);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Access token expired. Please refresh your token.', 'TOKEN_EXPIRED');
      }
      if (jwtError.name === 'JsonWebTokenError') {
        throw new UnauthorizedError('Invalid access token. Please log in again.', 'TOKEN_INVALID');
      }
      throw new UnauthorizedError('Token verification failed.');
    }

    // Find user and check status
    const user = await User.findById(decoded.id).select('+status +refreshTokenHash +failedLoginAttempts +lockUntil');

    if (!user) {
      throw new UnauthorizedError('User no longer exists. Please log in again.');
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new ForbiddenError('Account is not active. Please contact ORIC administration.');
    }

    // Check if account is locked
    if (user.isLocked) {
      throw new ForbiddenError('Account temporarily locked due to failed login attempts. Please try again later.');
    }

    // Attach user to request
    req.user = user;
    req.userId = user._id;
    req.tokenPayload = decoded;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication - attaches user if token is valid, continues if not
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, config.jwt.accessSecret);
    const user = await User.findById(decoded.id).select('+status');

    if (user && user.status === 'active') {
      req.user = user;
      req.userId = user._id;
      req.tokenPayload = decoded;
    }

    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};

/**
 * Generate access token for a user
 * @param {Object} user - User document
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires }
  );
};

/**
 * Generate refresh token for a user
 * @param {Object} user - User document
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  const jti = require('crypto').randomBytes(16).toString('hex');
  return jwt.sign(
    { id: user._id, type: 'refresh', jti },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpires }
  );
};

/**
 * Set refresh token as httpOnly cookie
 * @param {Object} res - Express response
 * @param {string} token - Refresh token
 */
const setRefreshTokenCookie = (res, token) => {
  const isProduction = config.isProduction;
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProduction, // HTTPS only in production
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/v1/auth',
  });
};

/**
 * Clear refresh token cookie
 * @param {Object} res - Express response
 */
const clearRefreshTokenCookie = (res) => {
  res.cookie('refreshToken', '', {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'strict' : 'lax',
    path: '/api/v1/auth',
    maxAge: 0,
    expires: new Date(0),
  });
};

module.exports = {
  authenticate,
  optionalAuth,
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  extractToken,
};