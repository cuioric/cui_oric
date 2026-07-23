/**
 * S3 Service
 * Handles file uploads, downloads, and management via AWS S3
 */

const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, generatePublicationKey, generateAvatarKey, getCloudFrontUrl, bucketName } = require('../config/s3');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Upload a PDF file to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} publicationId - Publication ID for namespacing
 * @param {string} originalName - Original filename
 * @returns {Promise<{key: string, url: string, size: number}>}
 */
const uploadPdf = async (buffer, publicationId, originalName) => {
  const key = generatePublicationKey(publicationId);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf',
    ContentDisposition: `attachment; filename="${originalName}"`,
    Metadata: {
      originalName,
      uploadedAt: new Date().toISOString(),
      publicationId,
    },
    ServerSideEncryption: 'AES256',
  });

  await s3Client.send(command);

  logger.info(`PDF uploaded to S3: ${key} (${buffer.length} bytes)`);

  return {
    key,
    url: `s3://${bucketName}/${key}`,
    size: buffer.length,
  };
};

/**
 * Upload a profile photo to S3
 * Unlike publication PDFs (private until oric_verified), profile photos are
 * always public — so we return a directly-usable URL, not a short-lived
 * presigned one. Prefer CloudFront (permanent URL, no expiry) if configured;
 * otherwise fall back to a long-lived presigned URL as a stopgap for local/dev
 * setups without a CDN in front of the bucket.
 * @param {Buffer} buffer - Image file buffer
 * @param {string} userId - User ID for namespacing
 * @param {string} extension - File extension without the dot (e.g. 'jpg')
 * @param {string} mimeType - Image MIME type (e.g. 'image/jpeg')
 * @returns {Promise<{key: string, url: string, size: number}>}
 */
const uploadAvatar = async (buffer, userId, extension, mimeType) => {
  const key = generateAvatarKey(userId, extension);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    Metadata: {
      userId,
      uploadedAt: new Date().toISOString(),
    },
    ServerSideEncryption: 'AES256',
  });

  await s3Client.send(command);

  logger.info(`Avatar uploaded to S3: ${key} (${buffer.length} bytes)`);

  const cdnUrl = getCloudFrontUrl(key);
  const url = cdnUrl || await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn: 7 * 24 * 60 * 60 } // 7 days — only used when no CDN is configured
  );

  return { key, url, size: buffer.length };
};

/**
 * Generate a pre-signed download URL
 * @param {string} key - S3 object key
 * @param {number} expiresIn - Expiration in seconds (default 1 hour)
 * @returns {Promise<string>} Pre-signed URL
 */
const getDownloadUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ResponseContentDisposition: 'attachment',
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Generate a pre-signed upload URL (for direct client uploads if needed)
 * @param {string} key - S3 object key
 * @param {number} expiresIn - Expiration in seconds
 * @returns {Promise<string>} Pre-signed URL
 */
const getUploadUrl = async (key, expiresIn = 3600) => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: 'application/pdf',
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Delete a file from S3
 * @param {string} key - S3 object key
 * @returns {Promise<void>}
 */
const deleteFile = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
  logger.info(`PDF deleted from S3: ${key}`);
};

/**
 * Check if a file exists in S3
 * @param {string} key - S3 object key
 * @returns {Promise<boolean>}
 */
const fileExists = async (key) => {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Get file metadata from S3
 * @param {string} key - S3 object key
 * @returns {Promise<Object|null>} File metadata or null if not found
 */
const getFileMetadata = async (key) => {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const response = await s3Client.send(command);
    return {
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
      metadata: response.Metadata,
      etag: response.ETag,
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Copy a file within S3 (for versioning/backup)
 * @param {string} sourceKey - Source object key
 * @param {string} destinationKey - Destination object key
 * @returns {Promise<void>}
 */
const copyFile = async (sourceKey, destinationKey) => {
  const { CopyObjectCommand } = require('@aws-sdk/client-s3');

  const command = new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: `${bucketName}/${sourceKey}`,
    Key: destinationKey,
  });

  await s3Client.send(command);
  logger.info(`PDF copied in S3: ${sourceKey} -> ${destinationKey}`);
};

/**
 * List files for a publication
 * @param {string} publicationId - Publication ID
 * @returns {Promise<Array>} List of files
 */
const listPublicationFiles = async (publicationId) => {
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

  const prefix = `publications/${publicationId}/`;
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  return (response.Contents || []).map((obj) => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
    etag: obj.ETag,
  }));
};

const s3Service = {
  uploadPdf,
  uploadAvatar,
  getDownloadUrl,
  getUploadUrl,
  deleteFile,
  fileExists,
  getFileMetadata,
  copyFile,
  listPublicationFiles,
  bucketName,
};

module.exports = { s3Service, ...s3Service };