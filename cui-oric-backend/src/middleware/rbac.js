/**
 * Role-Based Access Control Middleware
 * Enforces role permissions and department scoping
 */

const { ForbiddenError, NotFoundError, UnauthorizedError } = require('../utils/AppError');
const User = require('../models/User');
const Department = require('../models/Department');
const Publication = require('../models/Publication');

/**
 * Middleware factory: require specific role(s)
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Access denied. Required role: ${roles.join(' or ')}`));
    }

    next();
  };
};

/**
 * Middleware: require oric_admin role
 */
const requireOricAdmin = requireRole('oric_admin');

/**
 * Middleware: require HOD role
 */
const requireHod = requireRole('hod');

/**
 * Middleware: require faculty or student role (can create publications)
 */
const requireAuthor = requireRole('faculty', 'ms_student', 'phd_student');

/**
 * Middleware: require any authenticated user
 */
const requireAuth = requireRole('oric_admin', 'hod', 'faculty', 'ms_student', 'phd_student');

/**
 * Middleware: check if user owns the resource or has admin access
 * @param {Function} getResourceUserId - Function to extract userId from resource
 * @returns {Function} Express middleware
 */
const requireOwnershipOrAdmin = (getResourceUserId) => {
  return async (req, res, next) => {
    try {
      const resourceUserId = await getResourceUserId(req);

      // oric_admin can access everything
      if (req.user.role === 'oric_admin') {
        return next();
      }

      // Check ownership
      if (resourceUserId && resourceUserId.toString() === req.user._id.toString()) {
        return next();
      }

      // HOD can access resources in their department
      if (req.user.role === 'hod') {
        const department = await Department.findOne({ hodId: req.user._id });
        if (department) {
          // For publications, check departmentId
          if (req.params.publicationId) {
            const publication = await Publication.findById(req.params.publicationId).select('departmentId');
            if (publication && publication.departmentId.toString() === department._id.toString()) {
              return next();
            }
          }
          // For users, check departmentId
          if (req.params.userId) {
            const targetUser = await User.findById(req.params.userId).select('departmentId');
            if (targetUser && targetUser.departmentId && targetUser.departmentId.toString() === department._id.toString()) {
              return next();
            }
          }
        }
      }

      return next(new ForbiddenError('Access denied. You do not have permission to access this resource.'));
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: HOD department scoping
 * Ensures HOD can only act on publications in their department
 */
const requireHodDepartmentScope = async (req, res, next) => {
  try {
    if (req.user.role !== 'hod') {
      return next(); // Not a HOD, let other middleware handle
    }

    const department = await Department.findOne({ hodId: req.user._id });
    if (!department) {
      return next(new ForbiddenError('You are not assigned as HOD of any department'));
    }

    req.hodDepartment = department;
    req.hodDepartmentId = department._id;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware: validate publication access for current user
 * - oric_admin: all publications
 * - hod: publications in their department
 * - faculty/student: own publications (drafts, submitted) + verified publications
 * - unauthenticated: only verified publications
 */
const requirePublicationAccess = (requiredStatuses = null) => {
  return async (req, res, next) => {
    try {
      const publicationId = req.params.publicationId || req.params.id;
      if (!publicationId) {
        return next();
      }

      const publication = await Publication.findById(publicationId).select('-aiReview -lastRemarks');
      if (!publication) {
        return next(new NotFoundError('Publication not found'));
      }

      // Determine access rights FIRST, before revealing workflow state
      let hasAccess = false;

      if (req.user?.role === 'oric_admin') {
        hasAccess = publication.status !== 'draft' || publication.submittedBy.toString() === req.user._id.toString();
      } else if (!req.user) {
        hasAccess = publication.status === 'oric_verified';
      } else {
        const userId = req.user._id.toString();
        const isOwner =
          publication.submittedBy.toString() === userId ||
          publication.authors.some((a) => a.authorId && a.authorId.toString() === userId);

        if (isOwner) {
          hasAccess = true;
        } else if (req.user.role === 'hod') {
          const department = await Department.findOne({ hodId: req.user._id });
          if (department && publication.departmentId.toString() === department._id.toString() && publication.status !== 'draft') {
            hasAccess = true;
          }
        }

        if (!hasAccess && publication.status === 'oric_verified') {
          hasAccess = true;
        }
      }

      if (!hasAccess) {
        return next(new ForbiddenError('Access denied. You do not have permission to view this publication.'));
      }

      // Only now check status validity — user already has legitimate visibility
      if (requiredStatuses && !requiredStatuses.includes(publication.status)) {
        return next(new ForbiddenError(`Publication is not in a valid state for this action`));
      }

      req.publication = publication;
      return next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: validate user management access
 * - oric_admin: all users
 * - hod: users in their department (view only)
 */
const requireUserManagementAccess = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.params.id;
    if (!targetUserId) return next();

    // oric_admin: full access
    if (req.user.role === 'oric_admin') return next();

    const targetUser = await User.findById(targetUserId).select('departmentId role');
    if (!targetUser) {
      return next(new NotFoundError('User not found'));
    }

    // HOD: can view users in their department
    if (req.user.role === 'hod') {
      const department = await Department.findOne({ hodId: req.user._id });
      if (department && targetUser.departmentId && targetUser.departmentId.toString() === department._id.toString()) {
        // HOD can only view, not modify (modify requires oric_admin)
        if (['GET'].includes(req.method)) {
          return next();
        }
      }
    }

    return next(new ForbiddenError('Access denied. Insufficient permissions for user management.'));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requireRole,
  requireOricAdmin,
  requireHod,
  requireAuthor,
  requireAuth,
  requireOwnershipOrAdmin,
  requireHodDepartmentScope,
  requirePublicationAccess,
  requireUserManagementAccess,
};