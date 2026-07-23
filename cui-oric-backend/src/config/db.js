/**
 * MongoDB connection setup with Mongoose
 * Handles connection events, graceful shutdown, and indexes
 */

const mongoose = require("mongoose");
const config = require("./env");
const logger = require("./logger");

let isConnected = false;

/**
 * Connect to MongoDB with retry logic
 */
const connectDB = async () => {
  if (isConnected) {
    logger.info("MongoDB already connected");
    return;
  }

  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const conn = await mongoose.connect(config.mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 15000, // was 5000 — too tight for Atlas SRV failover
        socketTimeoutMS: 45000,
        family: 4,
      });

      isConnected = true;
      logger.info(
        `MongoDB connected: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`,
      );

      mongoose.connection.on("error", (err) => {
        logger.error("MongoDB connection error:", err);
        isConnected = false;
      });

      mongoose.connection.on("disconnected", () => {
        logger.warn("MongoDB disconnected");
        isConnected = false;
      });

      mongoose.connection.on("reconnected", () => {
        logger.info("MongoDB reconnected");
        isConnected = true;
      });

      await createIndexes();

      return conn;
    } catch (error) {
      lastError = error;
      logger.error(
        `MongoDB connection attempt ${attempt}/${maxAttempts} failed:`,
        error.message,
      );
      isConnected = false;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
};

/**
 * Create all required compound indexes
 * These must match the exact specifications in the schema documentation
 */

const ensureIndex = async (collection, keys, options) => {
  try {
    await collection.createIndex(keys, options);
  } catch (error) {
    if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
      const existing = await collection.indexes();
      const conflicting = existing.find(
        (idx) => JSON.stringify(idx.key) === JSON.stringify(keys) && idx.name !== options.name
      );
      if (conflicting) {
        await collection.dropIndex(conflicting.name);
        await collection.createIndex(keys, options);
      }
    } else {
      throw error;
    }
  }
};

const createIndexes = async () => {
  try {
    const Publication = require('../models/Publication');
    const Citation = require('../models/Citation');
    const User = require('../models/User');
    const Department = require('../models/Department');

    await ensureIndex(Publication.collection, { departmentId: 1, status: 1, year: -1 }, { name: 'idx_pub_dept_status_year' });
    await ensureIndex(Publication.collection, { 'authors.authorId': 1, status: 1 }, { name: 'idx_pub_author_status' });
    await ensureIndex(Publication.collection, { title: 'text', abstract: 'text', keywords: 'text' }, { name: 'idx_pub_text_search', weights: { title: 10, keywords: 5, abstract: 1 } });
    await ensureIndex(Citation.collection, { citedPaperId: 1, citingPaperId: 1 }, { name: 'idx_citation_cited_citing', unique: true, sparse: true });
    await ensureIndex(User.collection, { email: 1 }, { name: 'idx_user_email', unique: true });
    await ensureIndex(Department.collection, { hodId: 1 }, { name: 'idx_dept_hod' });

    logger.info('All required indexes created/verified');
  } catch (error) {
    logger.error('Error creating indexes:', error);
    // Don't throw - indexes might already exist
  }
};

/**
 * Graceful disconnect
 */
const disconnectDB = async () => {
  if (!isConnected) return;

  try {
    await mongoose.connection.close();
    isConnected = false;
    logger.info("MongoDB disconnected gracefully");
  } catch (error) {
    logger.error("Error disconnecting MongoDB:", error);
    throw error;
  }
};

/**
 * Check connection health
 */
const isHealthy = () => isConnected && mongoose.connection.readyState === 1;

module.exports = {
  connectDB,
  disconnectDB,
  isHealthy,
  getConnection: () => mongoose.connection,
};
