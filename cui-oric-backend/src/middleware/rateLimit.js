/**
 * Rate Limiting Middleware
 * Express-rate-limit configurations for different route groups
 */

const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const logger = require('../config/logger');
const { RateLimitError } = require('../utils/AppError');

const stores = [];

/**
 * Custom store that mirrors express-rate-limit's Store interface but
 * actually supports resetAll(), which the built-in MemoryStore does not.
 * Without this, resetAllLimiters() in tests/setup.js silently does nothing
 * and rate-limit state leaks across every test in the file.
 */
class ResettableMemoryStore {
  constructor() {
    this.hits = new Map();
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  _getRecord(key) {
    const now = Date.now();
    const existing = this.hits.get(key);
    if (!existing || existing.resetTime.getTime() <= now) {
      const record = { totalHits: 0, resetTime: new Date(now + this.windowMs) };
      this.hits.set(key, record);
      return record;
    }
    return existing;
  }

  async increment(key) {
    const record = this._getRecord(key);
    record.totalHits += 1;
    return { totalHits: record.totalHits, resetTime: record.resetTime };
  }

  async decrement(key) {
    const record = this.hits.get(key);
    if (record) record.totalHits = Math.max(0, record.totalHits - 1);
  }

  async resetKey(key) {
    this.hits.delete(key);
  }

  resetAll() {
    this.hits.clear();
  }
}

/**
 * Create a rate limiter with standard options
 * @param {Object} options - Rate limit options
 * @returns {Function} Express middleware
 */
const createLimiter = (options) => {
  const store = new ResettableMemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: {
      success: false,
      message: options.message || 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    store, // <-- this is the line that must be present, or it falls back to the built-in store
    keyGenerator: (req) => req.ip,
    skip: (req) => req.path === '/health' || req.path === '/api/v1/health',
    handler: (req, res, next, options) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
      // options.message is the object we configured above ({ success, message, code }),
      // not a string — passing it straight into RateLimitError made Error() stringify it
      // to the literal text "[object Object]" in both logs and the client-facing response.
      // Pull out the actual human-readable string instead.
      next(new RateLimitError(options.message.message, { limit: options.max, window: options.windowMs }));
    },
  });
};

// Strict rate limiter for auth endpoints
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
});

// General API rate limiter
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests. Please try again later.',
});

// Search endpoints
const searchLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many search requests. Please wait a moment.',
});

// File upload limiter
const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many file uploads. Please try again later.',
});

// Password reset limiter
const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset requests. Please try again later.',
});

// Email verification limiter
const emailVerificationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many verification requests. Please try again later.',
});

// Admin endpoints limiter
const adminLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many admin requests. Please try again later.',
});

const resetAllLimiters = () => {
  stores.forEach((s) => { if (typeof s.resetAll === 'function') s.resetAll(); });
};

module.exports = {
  authLimiter,
  apiLimiter,
  searchLimiter,
  uploadLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  adminLimiter,
  createLimiter,
  resetAllLimiters,
};