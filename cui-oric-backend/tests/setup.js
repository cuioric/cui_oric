/**
 * Jest Test Setup
 * Uses real MongoDB Atlas connection from env (no in-memory server)
 */

// IMPORTANT: these must be set BEFORE requiring '../src/app' below.
// config/env.js reads process.env once, at first require, and caches the
// values into a plain object — setting process.env later (e.g. inside
// beforeAll) has no effect on values already read and cached.
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-key-32-characters-long!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key-32-characters-long!!';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';
// Kept as one shared value so the existing hardcoded @cui.edu.pk test
// emails (faculty and student roles alike) keep passing unchanged —
// production uses two distinct domains, tests don't need to care which.
process.env.FACULTY_EMAIL_DOMAIN = 'cui.edu.pk';
process.env.STUDENT_EMAIL_DOMAIN = 'cui.edu.pk';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_S3_BUCKET = 'test-bucket';
process.env.CLAMAV_HOST = 'localhost';
process.env.CLAMAV_PORT = '3310';
process.env.MAX_PDF_SIZE_MB = '20';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';

const mongoose = require('mongoose');
const { initializeServices } = require('../src/app');
const { resetAllLimiters } = require('../src/middleware/rateLimit');

// Mock ESM modules that cause issues in Jest
jest.mock('text-readability', () => ({
  readability: jest.fn(() => ({ fleschKincaidReadingEase: 60 })),
  fleschKincaidGradeLevel: jest.fn(() => 10),
}));

jest.mock('unified', () => ({
  use: jest.fn().mockReturnThis(),
  parse: jest.fn(() => ({ children: [] })),
}));

jest.mock('retext-english', () => ({}));
jest.mock('retext-passive', () => ({}));
jest.mock('retext-stringify', () => ({}));

jest.mock('pdf-parse', () => jest.fn(() => Promise.resolve({
  text: 'Test PDF content',
  metadata: {},
  numpages: 1,
  info: {},
})));

jest.mock('write-good', () => jest.fn(() => []));

// Global test setup
beforeAll(async () => {
  // Use MONGO_URI from env (set this to your Atlas connection string)
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGO_URI environment variable required for tests');
  }

  // Safety guard: this suite wipes every collection after every test
  // (see afterEach below). Refuse to run against anything that doesn't
  // look like a disposable test database, so a misconfigured MONGO_URI
  // can't silently delete real data.
  if (!/test/i.test(uri)) {
    throw new Error(
      'MONGO_URI does not look like a test database (no "test" in the URI/db name). ' +
      'Refusing to run — this suite wipes all collections after every test. ' +
      'Point MONGO_URI at a dedicated test database before running npm test.'
    );
  }

  // Initialize app services (connects to real MongoDB)
  await initializeServices();
}, 60000);

// Clear database between tests
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  resetAllLimiters();
}, 30000);

// Global teardown
afterAll(async () => {
  await mongoose.disconnect();
}, 30000);

// Test utilities
global.testUtils = {
  // Create a test user
  createUser: async (overrides = {}) => {
    const User = require('../src/models/User');
    const userData = {
      name: 'Test User',
      email: `test${Date.now()}@cui.edu.pk`,
      password: 'Password@123',
      role: 'faculty',
      campus: 'Sahiwal',
      status: 'active',
      departmentId: null,
      ...overrides,
    };
    return User.create(userData);
  },

  // Create a test department
  createDepartment: async (overrides = {}) => {
    const Department = require('../src/models/Department');
    const deptData = {
      name: `Test Department ${Date.now()}`,
      campus: 'Sahiwal',
      hodId: null,
      ...overrides,
    };
    return Department.create(deptData);
  },

  // Generate auth tokens for a user
  generateTokens: (user) => {
    const jwt = require('jsonwebtoken');
    const config = require('../src/config/env');
    const accessToken = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      config.jwt.accessSecret,
      { expiresIn: config.jwt.accessExpires }
    );
    const refreshToken = jwt.sign(
      { id: user._id, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpires }
    );
    return { accessToken, refreshToken };
  },

  // Create author profile
  createAuthorProfile: async (userId, departmentId, overrides = {}) => {
    const AuthorProfile = require('../src/models/AuthorProfile');
    return AuthorProfile.create({
      userId,
      departmentId,
      designation: 'Assistant Professor',
      affiliation: 'COMSATS University Islamabad, Sahiwal Campus',
      verifiedEmail: true,
      ...overrides,
    });
  },

  // Create publication
  createPublication: async (authorId, departmentId, overrides = {}) => {
    const Publication = require('../src/models/Publication');
    return Publication.create({
      title: `Test Publication ${Date.now()}`,
      abstract: 'This is a test abstract for the publication.',
      publicationType: 'journal_article',
      authors: [
        { authorId, order: 1, isCorresponding: true },
      ],
      venue: {
        name: 'Test Journal',
        type: 'journal',
        volume: '1',
        issue: '1',
        pages: '1-10',
      },
      year: 2024,
      publicationDate: new Date('2024-01-15'),
      keywords: ['test', 'sample'],
      status: 'draft',
      submittedBy: authorId,
      departmentId,
      createdBy: authorId,
      ...overrides,
    });
  },
};