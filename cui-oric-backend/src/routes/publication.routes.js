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
const { apiLimiter, uploadLimiter, searchLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireAuthor, requireHod, requireOricAdmin, requireRole, requirePublicationAccess } = require('../middleware/rbac');
const { handlePdfUpload } = require('../middleware/upload');
const { virusScanMiddleware } = require('../middleware/virusScan');
const { optionalAuth } = require('../middleware/auth');

// All routes require authentication except list/get (handled by requirePublicationAccess)
router.use(apiLimiter);
router.use(optionalAuth);

// Create draft publication (faculty, ms_student, phd_student)
router.post('/', requireAuthor, validateCreatePublication, publicationController.createPublication);

// List publications with filters (public + authenticated)
router.get('/', validatePublicationSearch, publicationController.listPublications);

// Get publication by ID (access controlled by middleware)
router.get('/:id', validateMongoId('id'), requirePublicationAccess(), publicationController.getPublication);

// Update draft publication (owner only)
router.patch('/:id', validateMongoId('id'), requirePublicationAccess(['draft']), validateUpdatePublication, publicationController.updatePublication);

// Submit for HOD review (owner only)
router.post('/:id/submit', validateMongoId('id'), requirePublicationAccess(['draft']), validateSubmitPublication, publicationController.submitPublication);

// Resubmit a rejected publication back to draft (owner only)
router.post('/:id/resubmit', validateMongoId('id'), requirePublicationAccess(['hod_rejected', 'oric_rejected']), validateResubmitPublication, publicationController.resubmitPublication);

// HOD review (approve/reject) - HOD of department only
router.post('/:id/hod-review', validateMongoId('id'), requirePublicationAccess(['submitted_to_hod']), requireRole('hod', 'oric_admin'), validateHodReview, publicationController.hodReview);
// ORIC review (verify/reject) - ORIC admin only
router.post('/:id/oric-review', validateMongoId('id'), requirePublicationAccess(['sent_to_oric']), requireOricAdmin, validateOricReview, publicationController.oricReview);

// Upload PDF
router.post(
  '/:id/upload-pdf',
  validateMongoId('id'),
  requirePublicationAccess(['draft', 'hod_rejected', 'oric_rejected']),
  uploadLimiter,
  handlePdfUpload,
  virusScanMiddleware,
  publicationController.uploadPdf
);

// Get PDF download URL
router.get('/:id/download', validateMongoId('id'), requirePublicationAccess(), publicationController.getDownloadUrl);

// Get review history
router.get('/:id/reviews', validateMongoId('id'), requirePublicationAccess(), publicationController.getReviews);

// Delete publication (ORIC admin only)
router.delete('/:id', validateMongoId('id'), requireOricAdmin, publicationController.deletePublication);

// Update metadata (ORIC admin correction)
router.patch('/:id/metadata', validateMongoId('id'), requireOricAdmin, validatePublicationMetadataPatch, publicationController.updateMetadata);

module.exports = router;