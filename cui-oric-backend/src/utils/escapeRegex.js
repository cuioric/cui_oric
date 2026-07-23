/**
 * Escape a user-supplied string for safe use inside RegExp / MongoDB $regex.
 *
 * Without this, passing raw user input straight into `new RegExp(input)` or
 * `{ $regex: input }` lets an attacker submit a pathological pattern
 * (e.g. "(a+)+$") that triggers catastrophic backtracking and can hang the
 * entire Node.js event loop (ReDoS) — a single request blocking the whole
 * server for every other user.
 *
 * @param {string} input - Raw string from query/body
 * @returns {string} Escaped string safe to embed in a RegExp
 */
const escapeRegex = (input) => {
  if (typeof input !== 'string') return '';
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = { escapeRegex };
