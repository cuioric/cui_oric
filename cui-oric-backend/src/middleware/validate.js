/**
 * Validation Middleware
 * Express-validator based request validation with standardized error responses
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { ValidationError } = require('../utils/AppError');

/**
 * Handle validation results
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.type === 'field' ? err.path : err.type,
      message: err.msg,
      value: err.value,
    }));
    return next(new ValidationError('Validation failed', formattedErrors));
  }
  next();
};

/**
 * Sanitize input: trim strings, escape HTML
 */
const sanitize = (req, res, next) => {
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};

// ===== Auth Validators =====
const validateRegister = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('role')
    .notEmpty()
    .withMessage('Role is required')
    .isIn(['faculty', 'ms_student', 'phd_student'])
    .withMessage('Invalid role for registration'),
  body('campus')
    .notEmpty()
    .withMessage('Campus is required')
    .isIn(['Sahiwal', 'Islamabad', 'Lahore', 'Wah', 'Attock', 'Vehari', 'Virtual'])
    .withMessage('Invalid campus'),
  handleValidation,
];

const validateLogin = [
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidation,
];

const validateVerifyEmail = [
  param('token')
    .notEmpty()
    .withMessage('Verification token is required')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid token format'),
  handleValidation,
];

const validateForgotPassword = [
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  handleValidation,
];

const validateResetPassword = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid token format'),
  body('password')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  handleValidation,
];

const validateRefreshToken = [
  // Token comes from cookie or body
  body('refreshToken').optional().isString(),
  handleValidation,
];

// ===== User Management Validators =====
const validateApproveUser = [
  body('departmentId')
    .notEmpty()
    .withMessage('Department ID is required')
    .isMongoId()
    .withMessage('Invalid department ID'),
  body('role')
    .notEmpty()
    .withMessage('Role is required')
    .isIn(['hod', 'faculty', 'ms_student', 'phd_student'])
    .withMessage('Invalid role for approval'),
  handleValidation,
];

const validateUpdateUser = [
  body('name').optional().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('role')
    .optional()
    .isIn(['oric_admin', 'hod', 'faculty', 'ms_student', 'phd_student'])
    .withMessage('Invalid role'),
  body('status')
    .optional()
    .isIn(['pending_email_verification', 'pending_oric_approval', 'active', 'suspended', 'alumni'])
    .withMessage('Invalid status'),
  body('departmentId').optional().isMongoId().withMessage('Invalid department ID'),
  handleValidation,
];

// ===== Department Validators =====
const validateCreateDepartment = [
  body('name')
    .notEmpty()
    .withMessage('Department name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Department name must be 2-100 characters'),
  body('campus')
    .notEmpty()
    .withMessage('Campus is required')
    .isIn(['Sahiwal', 'Islamabad', 'Lahore', 'Wah', 'Attock', 'Vehari', 'Virtual'])
    .withMessage('Invalid campus'),
  body('hodId').optional().isMongoId().withMessage('Invalid HOD ID'),
  handleValidation,
];

const validateUpdateDepartment = [
  body('name').optional().isLength({ min: 2, max: 100 }).withMessage('Department name must be 2-100 characters'),
  body('campus')
    .optional()
    .isIn(['Sahiwal', 'Islamabad', 'Lahore', 'Wah', 'Attock', 'Vehari', 'Virtual'])
    .withMessage('Invalid campus'),
  body('hodId').optional().isMongoId().withMessage('Invalid HOD ID'),
  handleValidation,
];

// ===== Author Profile Validators =====
const validateUpdateAuthorProfile = [
  body('designation').optional().isLength({ max: 100 }).withMessage('Designation max 100 characters'),
  body('affiliation').optional().isLength({ max: 200 }).withMessage('Affiliation max 200 characters'),
  body('researchInterests').optional().isArray().withMessage('Research interests must be an array'),
  body('researchInterests.*').optional().isLength({ max: 50 }).withMessage('Interest tag max 50 characters'),
  body('homepageUrl')
    .optional()
    .isURL()
    .withMessage('Homepage must be a valid URL'),
  body('orcidId')
    .optional()
    .matches(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)
    .withMessage('Invalid ORCID format'),
  body('googleScholarId').optional().isString(),
  body('photoUrl').optional().isURL().withMessage('Photo must be a valid URL'),
  handleValidation,
];

// ===== Publication Validators =====
const authorValidator = [
  body('authorId').optional().isMongoId().withMessage('Invalid author ID'),
  body('externalName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('External author name must be 1-100 characters'),
  body('order').notEmpty().withMessage('Author order is required').isInt({ min: 1 }).withMessage('Order must be positive integer'),
  body('isCorresponding').optional().isBoolean().withMessage('isCorresponding must be boolean'),
];

const venueValidator = [
  body('venue.name')
    .notEmpty()
    .withMessage('Venue name is required')
    .isLength({ max: 200 })
    .withMessage('Venue name max 200 characters'),
  body('venue.type')
    .notEmpty()
    .withMessage('Venue type is required')
    .isIn(['journal', 'conference', 'book_publisher'])
    .withMessage('Invalid venue type'),
  body('venue.volume').optional().isLength({ max: 20 }).withMessage('Volume max 20 characters'),
  body('venue.issue').optional().isLength({ max: 20 }).withMessage('Issue max 20 characters'),
  body('venue.pages').optional().isLength({ max: 30 }).withMessage('Pages max 30 characters'),
  body('venue.impactFactor').optional().isFloat({ min: 0 }).withMessage('Impact factor must be non-negative'),
];

const validateCreatePublication = [
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 500 })
    .withMessage('Title max 500 characters'),
  body('abstract')
    .notEmpty()
    .withMessage('Abstract is required')
    .isLength({ max: 5000 })
    .withMessage('Abstract max 5000 characters'),
  body('publicationType')
    .notEmpty()
    .withMessage('Publication type is required')
    .isIn(['journal_article', 'conference_paper', 'book', 'book_chapter', 'thesis', 'preprint', 'patent'])
    .withMessage('Invalid publication type'),
  body('authors').isArray({ min: 1 }).withMessage('At least one author is required'),
  body('authors.*').custom((value, { req }) => {
    // Custom validation for each author
    if (!value.authorId && !value.externalName) {
      throw new Error('Either authorId or externalName is required');
    }
    if (value.authorId && !mongoose.Types.ObjectId.isValid(value.authorId)) {
      throw new Error('Invalid authorId');
    }
    return true;
  }),
  ...venueValidator,
  body('year')
    .notEmpty()
    .withMessage('Year is required')
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Invalid year'),
  body('publicationDate').optional().isISO8601().withMessage('Invalid date format'),
  body('doi')
    .optional()
    .matches(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i)
    .withMessage('Invalid DOI format'),
  body('url').optional().isURL().withMessage('Invalid URL'),
  body('keywords').optional().isArray().withMessage('Keywords must be an array'),
  body('keywords.*').optional().isLength({ max: 50 }).withMessage('Keyword max 50 characters'),
  handleValidation,
];

const validateUpdatePublication = [
  body('title').optional().isLength({ max: 500 }).withMessage('Title max 500 characters'),
  body('abstract').optional().isLength({ max: 5000 }).withMessage('Abstract max 5000 characters'),
  body('publicationType')
    .optional()
    .isIn(['journal_article', 'conference_paper', 'book', 'book_chapter', 'thesis', 'preprint', 'patent'])
    .withMessage('Invalid publication type'),
  body('authors').optional().isArray({ min: 1 }).withMessage('At least one author required'),
  ...venueValidator.map((v) => v.optional()),
  body('year').optional().isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Invalid year'),
  body('publicationDate').optional().isISO8601().withMessage('Invalid date format'),
  body('doi')
    .optional()
    .matches(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i)
    .withMessage('Invalid DOI format'),
  body('url').optional().isURL().withMessage('Invalid URL'),
  body('keywords').optional().isArray().withMessage('Keywords must be an array'),
  handleValidation,
];

const validateSubmitPublication = [
  body('remarks').optional().isLength({ max: 1000 }).withMessage('Remarks max 1000 characters'),
  handleValidation,
];

const validateResubmitPublication = [
  body('remarks').optional().isLength({ max: 1000 }).withMessage('Remarks max 1000 characters'),
  handleValidation,
];

const validateHodReview = [
  body('decision')
    .notEmpty()
    .withMessage('Decision is required')
    .isIn(['approved', 'rejected'])
    .withMessage('Decision must be approved or rejected'),
  body('remarks')
    .notEmpty()
    .withMessage('Remarks are required')
    .isLength({ max: 1000 })
    .withMessage('Remarks max 1000 characters'),
  handleValidation,
];

const validateOricReview = [
  body('decision')
    .notEmpty()
    .withMessage('Decision is required')
    .isIn(['verified', 'rejected'])
    .withMessage('Decision must be verified or rejected'),
  body('remarks')
    .notEmpty()
    .withMessage('Remarks are required')
    .isLength({ max: 1000 })
    .withMessage('Remarks max 1000 characters'),
  handleValidation,
];

const validatePublicationMetadataPatch = [
  body('title').optional().isLength({ max: 500 }).withMessage('Title max 500 characters'),
  body('abstract').optional().isLength({ max: 5000 }).withMessage('Abstract max 5000 characters'),
  body('venue').optional().isObject().withMessage('Venue must be an object'),
  body('year').optional().isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Invalid year'),
  body('doi')
    .optional()
    .matches(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i)
    .withMessage('Invalid DOI format'),
  body('keywords').optional().isArray().withMessage('Keywords must be an array'),
  handleValidation,
];

// ===== Citation Validators =====
const validateAddCitation = [
  body('citingPaperId').optional().isMongoId().withMessage('Invalid citing paper ID'),
  body('citedPaperId').notEmpty().withMessage('Cited paper ID is required').isMongoId().withMessage('Invalid cited paper ID'),
  body('citingPaperExternal').optional().isObject().withMessage('External citation must be an object'),
  body('citingPaperExternal.title')
    .optional()
    .isLength({ max: 500 })
    .withMessage('External title max 500 characters'),
  body('citingPaperExternal.authors').optional().isArray().withMessage('External authors must be array'),
  body('citingPaperExternal.venue').optional().isLength({ max: 200 }).withMessage('External venue max 200 characters'),
  body('citingPaperExternal.year')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Invalid year'),
  body('citingPaperExternal.url').optional().isURL().withMessage('External URL must be valid'),
  handleValidation,
];

// ===== Search/Query Validators =====
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100').toInt(),
  handleValidation,
];

const validatePublicationSearch = [
  query('q').optional().isString().withMessage('Search query must be string'),
  query('year').optional().isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Invalid year').toInt(),
  query('citationCount').optional().isInt({ min: 0 }).withMessage('Citation count must be non-negative').toInt(),
  query('departmentId').optional().isMongoId().withMessage('Invalid department ID'),
  query('researchInterest').optional().isString().withMessage('Research interest must be string'),
  query('publicationType')
    .optional()
    .isIn(['journal_article', 'conference_paper', 'book', 'book_chapter', 'thesis', 'preprint', 'patent'])
    .withMessage('Invalid publication type'),
  query('status')
    .optional()
    .isIn(['draft', 'submitted_to_hod', 'hod_approved', 'hod_rejected', 'sent_to_oric', 'oric_verified', 'oric_rejected'])
    .withMessage('Invalid status'),
  query('sortBy').optional().isIn(['createdAt', 'year', 'citationCount', 'title']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  ...validatePagination,
];

// ===== ID Parameter Validators =====
const validateMongoId = (paramName = 'id') => [
  param(paramName).isMongoId().withMessage(`Invalid ${paramName} format`),
  handleValidation,
];

const validateMultipleIds = (paramNames = ['id']) => [
  ...paramNames.map((name) => param(name).isMongoId().withMessage(`Invalid ${name} format`)),
  handleValidation,
];

module.exports = {
  handleValidation,
  sanitize,
  // Auth
  validateRegister,
  validateLogin,
  validateVerifyEmail,
  validateForgotPassword,
  validateResetPassword,
  validateRefreshToken,
  // User Management
  validateApproveUser,
  validateUpdateUser,
  // Departments
  validateCreateDepartment,
  validateUpdateDepartment,
  // Author Profiles
  validateUpdateAuthorProfile,
  // Publications
  validateCreatePublication,
  validateUpdatePublication,
  validateSubmitPublication,
  validateResubmitPublication,
  validateHodReview,
  validateOricReview,
  validatePublicationMetadataPatch,
  // Citations
  validateAddCitation,
  // Search
  validatePagination,
  validatePublicationSearch,
  // ID params
  validateMongoId,
  validateMultipleIds,
};