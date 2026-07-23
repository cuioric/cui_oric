/**
 * Virus Scanning Middleware
 * Uses clamscan npm package to scan files via local clamd daemon
 * This stands in for the AWS Lambda/S3 event trigger described in the architecture
 */

const ClamScan = require('clamscan');
const config = require('../config/env');
const logger = require('../config/logger');
const { ServiceUnavailableError, BadRequestError } = require('../utils/AppError');

let clamScanner = null;
let isClamAvAvailable = false;

/**
 * Initialize ClamAV scanner
 */
const initClamScanner = async () => {
  try {
    clamScanner = await new ClamScan().init({
      removeInfected: false, // We handle deletion ourselves
      quarantineInfected: false,
      scanLog: config.isDevelopment ? '/tmp/clamscan.log' : null,
      debugMode: config.isDevelopment,
      fileList: null,
      scanRecursively: false,
      clamdscan: {
        host: config.clamav.host,
        port: config.clamav.port,
        timeout: 60000, // 60 second timeout
        localFallback: false, // Don't fallback to clamscan binary, use daemon only
        configFile: null,
        multiscan: false,
        reloadDb: false,
        active: true,
      },
    });

    // Test connection
    const version = await clamScanner.getVersion();
    logger.info(`ClamAV daemon connected: ${version}`);
    isClamAvAvailable = true;
    return true;
  } catch (error) {
    logger.error('ClamAV daemon connection failed:', error.message);
    isClamAvAvailable = false;
    return false;
  }
};

/**
 * Scan a buffer for viruses
 * @param {Buffer} buffer - File buffer to scan
 * @returns {Promise<{clean: boolean, viruses: string[]}>}
 */
const scanBuffer = async (buffer) => {
  if (!isClamAvAvailable || !clamScanner) {
    // Always fail closed — never assume "clean" just because the scanner is unreachable
    throw new ServiceUnavailableError('Virus scanning service unavailable');
  }

  try {
    const result = await clamScanner.scanBuffer(buffer);
    return {
      clean: result.isInfected === false,
      viruses: result.isInfected ? result.viruses : [],
    };
  } catch (error) {
    logger.error('Virus scan error:', error);
    // Always fail closed on scan errors too — never default to "clean"
    throw new ServiceUnavailableError('Virus scanning failed');
  }
};

/**
 * Middleware to scan uploaded file for viruses
 * Expects req.uploadedFile from upload middleware
 */
const virusScanMiddleware = async (req, res, next) => {
  try {
    // Support both PDF uploads (req.uploadedFile) and avatar/photo uploads
    // (req.uploadedAvatar) — previously this only checked uploadedFile, which
    // silently let avatar images skip scanning entirely even when this
    // middleware was attached to an avatar route.
    const target = req.uploadedFile || req.uploadedAvatar;
    if (!target) {
      return next(); // No file to scan
    }

    logger.info(`Starting virus scan for file: ${target.originalName} (${target.size} bytes)`);

    const startTime = Date.now();
    const result = await scanBuffer(target.buffer);
    const duration = Date.now() - startTime;

    logger.info(`Virus scan completed in ${duration}ms: ${result.clean ? 'CLEAN' : 'INFECTED'}`);

    if (!result.clean) {
      logger.warn(`Virus detected in upload: ${result.viruses.join(', ')}`);
      return next(new BadRequestError(`File infected: ${result.viruses.join(', ')}. Upload rejected.`));
    }

    // Attach scan result to request
    req.virusScanResult = result;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Get ClamAV status for health checks
 */
const getClamAvStatus = async () => {
  if (!isClamAvAvailable || !clamScanner) {
    return { available: false, version: null };
  }

  try {
    const version = await clamScanner.getVersion();
    return { available: true, version };
  } catch (error) {
    return { available: false, version: null, error: error.message };
  }
};

module.exports = {
  initClamScanner,
  scanBuffer,
  virusScanMiddleware,
  getClamAvStatus,
  isAvailable: () => isClamAvAvailable,
};