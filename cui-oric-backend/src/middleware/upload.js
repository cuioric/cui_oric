/**
 * File Upload Middleware
 * Multer configuration for PDF uploads with validation
 */

const multer = require('multer');
const config = require('../config/env');
const { BadRequestError } = require('../utils/AppError');

/**
 * File filter: only allow PDF files
 * Validates both MIME type and file extension
 */
const fileFilter = (req, file, cb) => {
  // Check MIME type
  const allowedMimeTypes = ['application/pdf'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new BadRequestError('Only PDF files are allowed'), false);
  }

  // Check file extension
  const allowedExtensions = ['.pdf'];
  const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  if (!allowedExtensions.includes(fileExtension)) {
    return cb(new BadRequestError('Only PDF files are allowed'), false);
  }

  cb(null, true);
};

/**
 * Multer storage configuration (memory storage for virus scanning before S3 upload)
 */
const storage = multer.memoryStorage();

/**
 * Multer upload configuration
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxPdfSizeBytes, // 20MB default
    files: 1, // Only one file at a time
  },
});

/**
 * Single file upload middleware for publication PDFs
 * Field name: 'pdf'
 */
const uploadPdf = upload.single('pdf');

/**
 * Middleware to validate uploaded file after multer processing
 */
const validateUploadedFile = (req, res, next) => {
  if (!req.file) {
    return next(new BadRequestError('No PDF file uploaded'));
  }

  // Additional validation: check file header (magic bytes) for PDF
  const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
  if (req.file.buffer.length < 4 || !req.file.buffer.subarray(0, 4).equals(pdfSignature)) {
    return next(new BadRequestError('Invalid PDF file format'));
  }

  // Attach file info to request for downstream use
  req.uploadedFile = {
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  };

  next();
};

/**
 * Combined middleware for PDF upload with validation
 */
const handlePdfUpload = [uploadPdf, validateUploadedFile];

// ===== Profile photo (avatar) upload =====

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a profile photo

/**
 * File filter: only allow JPEG/PNG/WEBP images
 */
const imageFileFilter = (req, file, cb) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return cb(new BadRequestError('Only JPEG, PNG, or WEBP images are allowed'), false);
  }

  const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(fileExtension)) {
    return cb(new BadRequestError('Only JPEG, PNG, or WEBP images are allowed'), false);
  }

  cb(null, true);
};

const avatarUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_AVATAR_SIZE_BYTES,
    files: 1,
  },
});

const uploadAvatarFile = avatarUpload.single('photo');

/**
 * Magic-byte signatures for the image formats we accept. Checking these
 * (same approach as validateUploadedFile does for PDFs) stops someone from
 * renaming an arbitrary file to photo.jpg and having it accepted on
 * extension/MIME-type alone (both of which are trivially spoofable).
 */
const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WEBP: 'RIFF'....'WEBP' — signature bytes 0-3 and 8-11
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, secondary: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } },
];

const validateUploadedAvatar = (req, res, next) => {
  if (!req.file) {
    return next(new BadRequestError('No photo uploaded'));
  }

  const buffer = req.file.buffer;
  const matchesSignature = IMAGE_SIGNATURES.some(({ bytes, offset = 0, secondary }) => {
    if (buffer.length < offset + bytes.length) return false;
    const primaryMatch = buffer.subarray(offset, offset + bytes.length).equals(Buffer.from(bytes));
    if (!primaryMatch) return false;
    if (!secondary) return true;
    if (buffer.length < secondary.offset + secondary.bytes.length) return false;
    return buffer.subarray(secondary.offset, secondary.offset + secondary.bytes.length).equals(Buffer.from(secondary.bytes));
  });

  if (!matchesSignature) {
    return next(new BadRequestError('Invalid image file format'));
  }

  const extension = req.file.mimetype === 'image/jpeg' ? 'jpg'
    : req.file.mimetype === 'image/png' ? 'png'
    : 'webp';

  req.uploadedAvatar = {
    buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    extension,
    size: req.file.size,
  };

  next();
};

/**
 * Combined middleware for profile photo upload with validation
 */
const handleAvatarUpload = [uploadAvatarFile, validateUploadedAvatar];

module.exports = {
  upload,
  uploadPdf,
  validateUploadedFile,
  handlePdfUpload,
  fileFilter,
  avatarUpload,
  uploadAvatarFile,
  validateUploadedAvatar,
  handleAvatarUpload,
};