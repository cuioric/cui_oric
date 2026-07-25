/**
 * Express Application Setup
 * Main app configuration with all middleware, routes, and error handling
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const logger = require('./config/logger');
const { connectDB } = require('./config/db');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sanitize } = require('./middleware/validate');

// Route imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const departmentRoutes = require('./routes/department.routes');
const authorProfileRoutes = require('./routes/authorProfile.routes');
const publicationRoutes = require('./routes/publication.routes');
const searchRoutes = require('./routes/search.routes');
const citationRoutes = require('./routes/citation.routes');
const analyticsRoutes = require('./routes/analytics.routes');

// Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
};
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser for refresh tokens
app.use(cookieParser());

// Compression
app.use(compression());

// Security middleware
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(hpp()); // Prevent HTTP Parameter Pollution

// Input sanitization
app.use(sanitize);

// Logging
if (config.isDevelopment) {
  app.use(morgan('dev', { stream: { write: (msg) => logger.info(msg.trim()) } }));
} else {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin/users', userRoutes);
app.use('/api/v1/admin/departments', departmentRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/author-profile', authorProfileRoutes);
app.use('/api/v1/publications', publicationRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1', citationRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// Swagger Documentation
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CUI ORIC - Faculty Research & Publications Management API',
      version: '1.0.0',
      description: 'API documentation for COMSATS University Islamabad, Sahiwal Campus - Office of Research, Innovation and Commercialization',
      contact: {
        name: 'ORIC Sahiwal',
        email: 'oric@csahiwal.edu.pk',
      },
    },
    servers: [
      {
        url: config.isProduction ? 'https://api.cui-oric.edu.pk/api/v1' : `http://localhost:${config.port}/api/v1`,
        description: config.isProduction ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' },
            meta: { type: 'object' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication and authorization' },
      { name: 'Users', description: 'User management (Admin)' },
      { name: 'Departments', description: 'Department management' },
      { name: 'Author Profiles', description: 'Faculty/Student profiles' },
      { name: 'Publications', description: 'Publication lifecycle and workflow' },
      { name: 'Search', description: 'Publication search and discovery' },
      { name: 'Citations', description: 'Citation management and graphs' },
      { name: 'Analytics', description: 'Dashboards and statistics' },
    ],
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CUI ORIC API Documentation',
}));

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

// Initialize async services (lazy initialization)
let initializationPromise = null;

const initializeServices = async () => {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      // Connect to database
      await connectDB();

      // Verify email connection (skip in test)
      if (process.env.NODE_ENV !== 'test') {
        const emailService = require('./services/email.service');
        await emailService.verifyConnection();
      }

      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Service initialization failed:', error);
      throw error;
    }
  })();

  return initializationPromise;
};

// Export app and initialization function
module.exports = { app, initializeServices };