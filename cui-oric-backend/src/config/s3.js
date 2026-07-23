/**
 * AWS S3 Client Configuration
 * Uses AWS SDK v3 modular clients
 */

const { S3Client } = require('@aws-sdk/client-s3');
const config = require('./env');

/**
 * Create S3 client instance
 * Credentials and region from environment config
 */
const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

/**
 * Generate a namespaced S3 key for publication PDFs
 * Format: publications/{publicationId}/{uuid}.pdf
 * @param {string} publicationId - MongoDB ObjectId of the publication
 * @returns {string} S3 key
 */
const generatePublicationKey = (publicationId) => {
  const { v4: uuidv4 } = require('uuid');
  return `publications/${publicationId}/${uuidv4()}.pdf`;
};

/**
 * Generate a namespaced S3 key for author profile photos
 * Format: avatars/{userId}/{uuid}.{ext}
 * @param {string} userId - MongoDB ObjectId of the user
 * @param {string} extension - File extension without the dot (e.g. 'jpg', 'png', 'webp')
 * @returns {string} S3 key
 */
const generateAvatarKey = (userId, extension) => {
  const { v4: uuidv4 } = require('uuid');
  return `avatars/${userId}/${uuidv4()}.${extension}`;
};

/**
 * Generate a pre-signed URL for secure download
 * @param {string} key - S3 object key
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} Pre-signed URL
 */
const getPresignedDownloadUrl = async (key, expiresIn = 3600) => {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const command = new GetObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Generate a pre-signed URL for secure upload (if needed for direct client uploads)
 * @param {string} key - S3 object key
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} Pre-signed URL
 */
const getPresignedUploadUrl = async (key, expiresIn = 3600) => {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const command = new PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
    ContentType: 'application/pdf',
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Delete an object from S3
 * @param {string} key - S3 object key
 * @returns {Promise<void>}
 */
const deleteObject = async (key) => {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

  const command = new DeleteObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
  });

  await s3Client.send(command);
};

/**
 * Check if an object exists in S3
 * @param {string} key - S3 object key
 * @returns {Promise<boolean>}
 */
const objectExists = async (key) => {
  const { HeadObjectCommand } = require('@aws-sdk/client-s3');

  try {
    const command = new HeadObjectCommand({
      Bucket: config.aws.s3Bucket,
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
 * Get CloudFront URL for an object (if CloudFront configured)
 * @param {string} key - S3 object key
 * @returns {string|null} CloudFront URL or null if not configured
 */
const getCloudFrontUrl = (key) => {
  if (!config.aws.cloudfrontDomain) return null;
  return `https://${config.aws.cloudfrontDomain}/${key}`;
};

module.exports = {
  s3Client,
  generatePublicationKey,
  generateAvatarKey,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  deleteObject,
  objectExists,
  getCloudFrontUrl,
  bucketName: config.aws.s3Bucket,
};