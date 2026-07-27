/**
 * Publication Routes
 * Full publication lifecycle with workflow state machine
 */

const express = require('express');
const router = express.Router();

const publicationController = require('../controllers/publication.controller');
const {
  validateCreatePublication,
  validateUpdatePublication,
  validateSubmitPublication,
  validateResubmitPublication,
  validateHodReview,
  validateOricReview,
  validatePublicationMetadataPatch,
  validatePublicationSearch,
  validateMongoId,
} = require('../middleware/validate');
const { apiLimiter, uploadLimiter, searchLimiter, createLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireAuthor, requireHod, requireOricAdmin, requireRole, requirePublicationAccess } = require('../middleware/rbac');
const { handlePdfUpload } = require('../middleware/upload');
const { optionalAuth } = require('../middleware/auth');

const publicationBrowseLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many publication requests. Please try again later.',
});

// Browsing publications is common; use a more generous limiter here.
router.use(publicationBrowseLimiter);
router.use(optionalAuth);

// Create draft publication (faculty, ms_student, phd_student)
router.post('/', apiLimiter, requireAuthor, validateCreatePublication, publicationController.createPublication);

// List publications with filters (public + authenticated)
router.get('/', validatePublicationSearch, publicationController.listPublications);

// Export publications as CSV with dynamic filters (Admin only) — must be registered before '/:id'
router.get('/export', apiLimiter, requireOricAdmin, publicationController.exportPublicationsCsv);

// Get publication by ID (access controlled by middleware)
router.get('/:id', validateMongoId('id'), requirePublicationAccess(), publicationController.getPublication);

// Update draft publication (owner only)
router.patch('/:id', apiLimiter, validateMongoId('id'), requirePublicationAccess(['draft']), validateUpdatePublication, publicationController.updatePublication);

// Submit for HOD review (owner only)
router.post('/:id/submit', apiLimiter, validateMongoId('id'), requirePublicationAccess(['draft']), validateSubmitPublication, publicationController.submitPublication);

// Resubmit a rejected publication back to draft (owner only)
router.post('/:id/resubmit', apiLimiter, validateMongoId('id'), requirePublicationAccess(['hod_rejected', 'oric_rejected']), validateResubmitPublication, publicationController.resubmitPublication);

// HOD review (approve/reject) - HOD of department only
router.post('/:id/hod-review', apiLimiter, validateMongoId('id'), requirePublicationAccess(['submitted_to_hod']), requireRole('hod', 'oric_admin'), validateHodReview, publicationController.hodReview);
// ORIC review (verify/reject) - ORIC admin only
router.post('/:id/oric-review', apiLimiter, validateMongoId('id'), requirePublicationAccess(['sent_to_oric']), requireOricAdmin, validateOricReview, publicationController.oricReview);

// Upload PDF
router.post(
  '/:id/upload-pdf',
  validateMongoId('id'),
  requirePublicationAccess(['draft', 'hod_rejected', 'oric_rejected']),
  uploadLimiter,
  handlePdfUpload,
  publicationController.uploadPdf
);

// Get PDF download URL
router.get('/:id/download', validateMongoId('id'), requirePublicationAccess(), publicationController.getDownloadUrl);

// Get review history
router.get('/:id/reviews', validateMongoId('id'), requirePublicationAccess(), publicationController.getReviews);

// Delete publication (ORIC admin only)
router.delete('/:id', validateMongoId('id'), requireOricAdmin, publicationController.deletePublication);

// Update metadata (ORIC admin correction)
router.patch('/:id/metadata', apiLimiter, validateMongoId('id'), requireOricAdmin, validatePublicationMetadataPatch, publicationController.updateMetadata);

module.exports = router;