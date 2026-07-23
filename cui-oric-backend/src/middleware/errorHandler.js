/**
 * Global Error Handler Middleware
 * Centralized error handling with appropriate responses
 */
const mongoose = require('mongoose');
const config = require('../config/env');
const logger = require('../config/logger');
const { error: apiError } = require('../utils/apiResponse');
const {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
} = require('../utils/AppError');

/**
 * Handle Mongoose validation errors
 */
const handleMongooseValidationError = (err) => {
  const errors = Object.values(err.errors).map((e) => ({
    field: e.path,
    message: e.message,
    value: e.value,
  }));
  return new ValidationError('Validation failed', errors);
};

/**
 * Handle Mongoose duplicate key errors
 */
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  return new ConflictError(`${field} '${value}' already exists`, { field, value });
};

/**
 * Handle Mongoose cast errors (invalid ObjectId, etc.)
 */
const handleCastError = (err) => {
  return new BadRequestError(`Invalid ${err.path}: ${err.value}`, { path: err.path, value: err.value });
};

/**
 * Handle JWT errors
 */
const handleJWTError = (err) => {
  if (err.name === 'TokenExpiredError') {
    return new UnauthorizedError('Token expired. Please log in again.', 'TOKEN_EXPIRED');
  }
  if (err.name === 'JsonWebTokenError') {
    return new UnauthorizedError('Invalid token. Please log in again.', 'TOKEN_INVALID');
  }
  return new UnauthorizedError('Authentication failed');
};

/**
 * Handle Multer errors (file upload)
 */
const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new BadRequestError('File size exceeds maximum allowed limit');
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new BadRequestError('Too many files uploaded');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new BadRequestError('Unexpected file field');
  }
  return new BadRequestError(err.message);
};

/**
 * Global error handler
 */
const globalErrorHandler = (err, req, res, next) => {
  // Log error
  logger.error('Error occurred:', {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?._id,
  });

  // Convert known errors to AppError
  let appError = err;

  if (err.name === 'ValidationError' && err instanceof mongoose.Error.ValidationError) {
    appError = handleMongooseValidationError(err);
  } else if (err.name === 'MongoServerError' && err.code === 11000) {
    appError = handleDuplicateKeyError(err);
  } else if (err.name === 'CastError') {
    appError = handleCastError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    appError = handleJWTError(err);
  } else if (err.name === 'MulterError') {
    appError = handleMulterError(err);
  } else if (!(err instanceof AppError)) {
    // Unknown error - wrap as internal server error
    appError = new InternalServerError(
      config.isProduction ? 'Internal server error' : err.message,
      config.isProduction ? null : { originalMessage: err.message, stack: err.stack }
    );
  }

  // Send response
  return apiError(
    res,
    appError.message,
    appError.statusCode,
    appError.code,
    appError.details
  );
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  const message = `Route ${req.method} ${req.originalUrl} not found`;
  return apiError(res, message, 404, 'ROUTE_NOT_FOUND');
};

/**
 * Async wrapper for route handlers (alternative to catchAsync)
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
  handleMongooseValidationError,
  handleDuplicateKeyError,
  handleCastError,
  handleJWTError,
  handleMulterError,
};