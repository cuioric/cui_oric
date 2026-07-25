/**
 * Standardized API Response Format
 * All responses follow: { success, data, meta, message }
 */

const config = require('../config/env');

/**
 * Success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Optional success message
 * @param {Object} meta - Optional metadata (pagination, etc.)
 * @param {number} statusCode - HTTP status code (default 200)
 */
const success = (res, data, message = 'Success', meta = null, statusCode = 200) => {
  const response = {
    success: true,
    message,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

/**
 * Error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Error code
 * @param {*} details - Optional error details
 */
const error = (res, message = 'Error', statusCode = 500, code = 'ERROR', details = null) => {
  const response = {
    success: false,
    message,
    code,
  };

  if (details) {
    response.details = details;
  }

  // In production, don't leak stack traces or internal details
  if (config.isProduction && statusCode >= 500) {
    response.message = 'Internal server error';
    response.details = undefined;
  }

  return res.status(statusCode).json(response);
};

/**
 * Pagination metadata builder
 * @param {number} page - Current page (1-indexed)
 * @param {number} limit - Items per page
 * @param {number} total - Total items count
 * @param {number} totalPages - Total pages
 * @returns {Object} Pagination metadata
 */
const paginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  return {
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

module.exports = {
  success,
  error,
  paginationMeta,
};