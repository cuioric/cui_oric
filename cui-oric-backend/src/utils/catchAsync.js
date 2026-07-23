/**
 * Wrapper to catch async errors and pass to Express error handler
 * Eliminates try/catch boilerplate in controllers
 */

/**
 * Wraps an async controller function to catch errors
 * @param {Function} fn - Async controller function
 * @returns {Function} Express middleware that catches errors
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;