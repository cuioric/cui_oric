/**
 * Environment configuration with validation
 * All required env vars must be present; missing ones throw at startup
 */
require('dotenv').config();
const requiredEnvVars = [
  'MONGO_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'FACULTY_EMAIL_DOMAIN',
  'STUDENT_EMAIL_DOMAIN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_S3_BUCKET',
  'CLAMAV_HOST',
  'CLAMAV_PORT',
];

const optionalEnvVars = [
  'PORT',
  'NODE_ENV',
  'JWT_ACCESS_EXPIRES',
  'JWT_REFRESH_EXPIRES',
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USER',
  'EMAIL_SMTP_PASS',
  'EMAIL_FROM',
  'AWS_CLOUDFRONT_DOMAIN',
  'MAX_PDF_SIZE_MB',
  'CORS_ORIGIN',
  'LANGUAGETOOL_API_URL',
  'LANGUAGETOOL_API_KEY',
];

// In test environment, skip validation (test setup provides these)
const isTest = process.env.NODE_ENV === 'test';

// Validate required env vars on load (skip in test)
if (!isTest) {
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Validate JWT secrets length
  if (process.env.JWT_ACCESS_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
  }
  if (process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters');
  }
}

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',

  // Database
  mongoUri: process.env.MONGO_URI || (isTest ? 'mongodb://localhost:27017/test' : ''),

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || (isTest ? 'test-access-secret-key-32-characters-long!!' : ''),
    refreshSecret: process.env.JWT_REFRESH_SECRET || (isTest ? 'test-refresh-secret-key-32-characters-long!!' : ''),
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  // Email
  email: {
    // Faculty (and HOD/ORIC admin, who are promoted from faculty accounts)
    // use the main campus domain; MS/PhD students use the students subdomain.
    facultyDomain: process.env.FACULTY_EMAIL_DOMAIN || 'cuisahiwal.edu.pk',
    studentDomain: process.env.STUDENT_EMAIL_DOMAIN || 'students.cuisahiwal.edu.pk',
    smtp: {
      host: process.env.EMAIL_SMTP_HOST,
      port: parseInt(process.env.EMAIL_SMTP_PORT, 10) || 587,
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS,
    },
    from: process.env.EMAIL_FROM || 'noreply@cuisahiwal.edu.pk',
  },

  // AWS S3
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    region: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'test-bucket',
    cloudfrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN,
  },

  // ClamAV
  clamav: {
    host: process.env.CLAMAV_HOST || 'localhost',
    port: parseInt(process.env.CLAMAV_PORT, 10) || 3310,
  },

  // File Upload
  upload: {
    maxPdfSizeMb: parseInt(process.env.MAX_PDF_SIZE_MB, 10) || 20,
    maxPdfSizeBytes: (parseInt(process.env.MAX_PDF_SIZE_MB, 10) || 20) * 1024 * 1024,
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },

  // LanguageTool (optional)
  languagetool: {
    apiUrl: process.env.LANGUAGETOOL_API_URL || 'https://api.languagetool.org/v2',
    apiKey: process.env.LANGUAGETOOL_API_KEY || '',
    enabled: !!process.env.LANGUAGETOOL_API_KEY,
  },
};

module.exports = config;