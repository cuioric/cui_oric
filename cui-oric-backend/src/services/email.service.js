/**
 * Email Service
 * Handles sending emails via Brevo (Sendinblue) Transactional Email API with queue/retry logic
 */

const config = require('../config/env');
const logger = require('../config/logger');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Email queue for async sending
const emailQueue = [];
let isProcessing = false;

/**
 * Check if Brevo is configured
 */
const isBrevoConfigured = () => {
  if (!config.email.brevo || !config.email.brevo.apiKey) {
    logger.warn('Brevo API key not configured - emails will be logged only');
    return false;
  }
  return true;
};

/**
 * Verify Brevo API connection (checks account endpoint)
 */
const verifyConnection = async () => {
  if (!isBrevoConfigured()) return false;
  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'api-key': config.email.brevo.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Brevo account check failed with status ${response.status}`);
    }

    logger.info('Brevo API connection verified');
    return true;
  } catch (error) {
    logger.error('Brevo API connection failed:', error.message);
    return false;
  }
};

/**
 * Convert attachments to Brevo's expected format
 * Expects attachments as [{ filename, content (base64 string or Buffer), path }]
 */
const formatAttachments = (attachments = []) => {
  if (!attachments || attachments.length === 0) return undefined;

  return attachments.map((attachment) => {
    let base64Content = attachment.content;

    if (Buffer.isBuffer(attachment.content)) {
      base64Content = attachment.content.toString('base64');
    } else if (attachment.content && typeof attachment.content === 'string') {
      // Assume already base64-encoded if not a Buffer
      base64Content = attachment.content;
    }

    return {
      name: attachment.filename,
      content: base64Content,
      url: attachment.path, // Brevo also supports remote URL attachments
    };
  });
};

/**
 * Send email with retry logic via Brevo API
 * @param {Object} options - Email options
 * @returns {Promise<boolean>} Success status
 */
const sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  if (!isBrevoConfigured()) {
    // Log email in development when Brevo not configured
    if (config.isDevelopment) {
      logger.info('DEV EMAIL:', { to, subject, text: text?.substring(0, 200) });
    }
    return true;
  }

  const payload = {
    sender: {
      email: config.email.from.email || config.email.from,
      name: config.email.from.name || 'CUI ORIC',
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
    attachment: formatAttachments(attachments),
  };

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'api-key': config.email.brevo.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Brevo API responded with status ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      logger.info(`Email sent to ${to}: ${data.messageId}`);
      return true;
    } catch (error) {
      attempts++;
      logger.warn(`Email send attempt ${attempts} failed:`, error.message);

      if (attempts >= maxAttempts) {
        logger.error(`Email send failed after ${maxAttempts} attempts:`, error);
        // Queue for retry
        queueEmail({ to, subject, html, text, attachments, attempts: 0 });
        return false;
      }

      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
    }
  }

  return false;
};

/**
 * Queue email for background retry
 */
const queueEmail = (emailData) => {
  emailQueue.push({
    ...emailData,
    queuedAt: new Date(),
  });

  if (!isProcessing) {
    processQueue();
  }
};

/**
 * Process email queue
 */
const processQueue = async () => {
  if (isProcessing || emailQueue.length === 0) return;

  isProcessing = true;

  while (emailQueue.length > 0) {
    const email = emailQueue.shift();
    if (email.attempts >= 3) {
      logger.error('Email max retries exceeded, dropping:', email.to, email.subject);
      continue;
    }

    email.attempts++;
    const success = await sendEmail(email);

    if (!success && email.attempts < 3) {
      // Re-queue with delay
      setTimeout(() => {
        emailQueue.unshift(email);
        processQueue();
      }, 5000 * email.attempts);
    }
  }

  isProcessing = false;
};

/**
 * Email templates
 */
const templates = {
  emailVerification: (name, verificationUrl) => ({
    subject: 'Verify your CUI ORIC Account',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
          .header { background: #1a3c6e; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px; text-align: center; }
          .button { display: inline-block; background: #1a3c6e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CUI ORIC</h1>
            <p>Faculty Research & Publications Management System</p>
          </div>
          <p>Dear ${name},</p>
          <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
          <p style="text-align: center;">
            <a href="${verificationUrl}" class="button" style="display: inline-block; background-color: #1a3c6e; color: #ffffff !important; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold;">Verify Email Address</a>
          </p>
          <p>Or copy this link: <a href="${verificationUrl}">${verificationUrl}</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>If you did not create an account, please ignore this email.</p>
          <div class="footer">
            <p>COMSATS University Islamabad, Sahiwal Campus</p>
            <p>Office of Research, Innovation and Commercialization (ORIC)</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${name},\n\nPlease verify your email: ${verificationUrl}\n\nThis link expires in 24 hours.\n\nCUI ORIC - Sahiwal Campus`,
  }),

  passwordReset: (name, resetUrl) => ({
    subject: 'Reset your CUI ORIC Password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
          .header { background: #1a3c6e; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px; text-align: center; }
          .button { display: inline-block; background: #1a3c6e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 20px 0; color: #856404; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CUI ORIC</h1>
            <p>Password Reset Request</p>
          </div>
          <p>Dear ${name},</p>
          <p>You requested a password reset. Click the button below to set a new password:</p>
          <p style="text-align: center;">
            <a href="${resetUrl}" class="button" style="display: inline-block; background-color: #1a3c6e; color: #ffffff !important; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold;">Reset Password</a>
          </p>
          <p>Or copy this link: <a href="${resetUrl}">${resetUrl}</a></p>
          <div class="warning">
            <strong>Security Notice:</strong> This link expires in 1 hour. If you did not request this, please ignore this email and your password will remain unchanged.
          </div>
          <div class="footer">
            <p>COMSATS University Islamabad, Sahiwal Campus</p>
            <p>Office of Research, Innovation and Commercialization (ORIC)</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${name},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.\n\nCUI ORIC - Sahiwal Campus`,
  }),

  publicationApproved: (name, publicationTitle, reviewerName, remarks) => ({
    subject: `Publication Approved: ${publicationTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
          .header { background: #28a745; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px; text-align: center; }
          .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Publication Approved</h1>
          </div>
          <p>Dear ${name},</p>
          <p>Your publication has been approved:</p>
          <div class="details">
            <strong>Title:</strong> ${publicationTitle}<br>
            <strong>Reviewed by:</strong> ${reviewerName}<br>
            <strong>Remarks:</strong> ${remarks}
          </div>
          <div class="footer">
            <p>CUI ORIC - Sahiwal Campus</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${name},\n\nYour publication "${publicationTitle}" has been approved.\nReviewed by: ${reviewerName}\nRemarks: ${remarks}\n\nCUI ORIC - Sahiwal Campus`,
  }),

  publicationRejected: (name, publicationTitle, reviewerName, remarks) => ({
    subject: `Publication Rejected: ${publicationTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
          .header { background: #dc3545; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px; text-align: center; }
          .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Publication Rejected</h1>
          </div>
          <p>Dear ${name},</p>
          <p>Your publication has been rejected:</p>
          <div class="details">
            <strong>Title:</strong> ${publicationTitle}<br>
            <strong>Reviewed by:</strong> ${reviewerName}<br>
            <strong>Remarks:</strong> ${remarks}
          </div>
          <p>You may revise and resubmit as a draft.</p>
          <div class="footer">
            <p>CUI ORIC - Sahiwal Campus</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${name},\n\nYour publication "${publicationTitle}" has been rejected.\nReviewed by: ${reviewerName}\nRemarks: ${remarks}\n\nYou may revise and resubmit as a draft.\n\nCUI ORIC - Sahiwal Campus`,
  }),

  accountApproved: (name) => ({
    subject: 'Your CUI ORIC Account Has Been Approved',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
          .header { background: #28a745; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px; text-align: center; }
          .button { display: inline-block; background: #1a3c6e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Account Approved</h1>
          </div>
          <p>Dear ${name},</p>
          <p>Your account has been approved by ORIC administration. You can now log in to the CUI ORIC system.</p>
          <p style="text-align: center;">
            <a href="${config.cors.origin}/login" class="button" style="display: inline-block; background-color: #1a3c6e; color: #ffffff !important; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold;">Log In</a>
          </p>
          <div class="footer">
            <p>COMSATS University Islamabad, Sahiwal Campus</p>
            <p>Office of Research, Innovation and Commercialization (ORIC)</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${name},\n\nYour account has been approved. You can now log in at ${config.cors.origin}/login\n\nCUI ORIC - Sahiwal Campus`,
  }),

  accountRejected: (name, reason) => ({
    subject: 'Update on Your CUI ORIC Account Application',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
          .header { background: #dc3545; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px; text-align: center; }
          .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Account Application Not Approved</h1>
          </div>
          <p>Dear ${name},</p>
          <p>We regret to inform you that your CUI ORIC account application has not been approved by ORIC administration.</p>
          <div class="details">
            <strong>Reason:</strong> ${reason || 'Not specified'}
          </div>
          <p>If you believe this was a mistake or would like to provide additional information, please contact the ORIC office.</p>
          <div class="footer">
            <p>COMSATS University Islamabad, Sahiwal Campus</p>
            <p>Office of Research, Innovation and Commercialization (ORIC)</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${name},\n\nYour CUI ORIC account application has not been approved.\nReason: ${reason || 'Not specified'}\n\nIf you believe this was a mistake, please contact the ORIC office.\n\nCUI ORIC - Sahiwal Campus`,
  }),
};

/**
 * Send templated email
 */
const sendTemplatedEmail = async (to, name, templateName, ...templateArgs) => {
  const template = templates[templateName];
  if (!template) {
    throw new Error(`Email template not found: ${templateName}`);
  }

  const { subject, html, text } = template(name, ...templateArgs);
  return sendEmail({ to, subject, html, text });
};

module.exports = {
  sendEmail,
  sendTemplatedEmail,
  verifyConnection,
  templates,
  queueEmail,
};