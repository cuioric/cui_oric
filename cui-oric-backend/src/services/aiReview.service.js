/**
 * AI Review Service
 * PDF metadata extraction, readability scoring, grammar/passive voice checks
 * Plagiarism check via LanguageTool API (optional, swappable via env)
 */

const pdfParse = require('pdf-parse');
const { readability, fleschKincaidGradeLevel } = require('text-readability');
const unified = require('unified');
const retextEnglish = require('retext-english');
const retextPassive = require('retext-passive');
const writeGood = require('write-good');
const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Extract text and metadata from PDF buffer
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<{text: string, metadata: Object, pageCount: number}>}
 */
const extractPdfData = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      metadata: data.metadata || {},
      pageCount: data.numpages,
      info: data.info || {},
    };
  } catch (error) {
    logger.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file');
  }
};

/**
 * Calculate readability scores
 * @param {string} text - Text content
 * @returns {Object} Readability scores
 */
const calculateReadability = (text) => {
  try {
    // Flesch-Kincaid Grade Level
    const fkGrade = fleschKincaidGradeLevel(text);

    // Flesch Reading Ease (0-100, higher = easier)
    const fkEase = readability(text).fleschKincaidReadingEase;

    // Normalize to 0-100 scale (inverse of grade level roughly)
    let normalizedScore;
    if (fkGrade <= 6) normalizedScore = 90;
    else if (fkGrade <= 8) normalizedScore = 80;
    else if (fkGrade <= 10) normalizedScore = 70;
    else if (fkGrade <= 12) normalizedScore = 60;
    else if (fkGrade <= 14) normalizedScore = 50;
    else if (fkGrade <= 16) normalizedScore = 40;
    else normalizedScore = 30;

    return {
      fleschKincaidGradeLevel: Math.round(fkGrade * 10) / 10,
      fleschKincaidReadingEase: Math.round(fkEase * 10) / 10,
      readabilityScore: normalizedScore,
    };
  } catch (error) {
    logger.warn('Readability calculation error:', error.message);
    return {
      fleschKincaidGradeLevel: null,
      fleschKincaidReadingEase: null,
      readabilityScore: null,
    };
  }
};

/**
 * Check grammar and style issues using write-good
 * @param {string} text - Text content
 * @returns {Object} Grammar issues
 */
const checkGrammarAndStyle = (text) => {
  try {
    // Limit text length for performance
    const sampleText = text.substring(0, 50000);

    const suggestions = writeGood(sampleText, {
      passive: true,
      thereIs: true,
      adverb: true,
      tooWordy: true,
      cliches: true,
      ePrime: false,
      illusion: true,
      so: true,
      template: true,
    });

    // Count passive voice occurrences
    const passiveCount = suggestions.filter((s) => s.reason.includes('passive')).length;

    // Total issues
    const totalIssues = suggestions.length;

    return {
      grammarIssuesCount: totalIssues,
      passiveVoiceCount: passiveCount,
      suggestions: suggestions.map((s) => ({
        reason: s.reason,
        index: s.index,
        offset: s.offset,
      })),
    };
  } catch (error) {
    logger.warn('Grammar check error:', error.message);
    return {
      grammarIssuesCount: 0,
      passiveVoiceCount: 0,
      suggestions: [],
    };
  }
};

/**
 * Check passive voice percentage using retext
 * @param {string} text - Text content
 * @returns {Promise<number>} Passive voice percentage
 */
const checkPassiveVoicePercentage = async (text) => {
  try {
    // Limit for performance
    const sampleText = text.substring(0, 30000);

    const processor = unified()
      .use(retextEnglish)
      .use(retextPassive);

    const file = await processor.parse(sampleText);
    let passiveSentences = 0;
    let totalSentences = 0;

    // Count sentences and passive ones
    const visit = (node) => {
      if (node.type === 'SentenceNode') {
        totalSentences++;
        if (node.data && node.data.passive) {
          passiveSentences++;
        }
      }
      if (node.children) {
        node.children.forEach(visit);
      }
    };

    visit(file);

    if (totalSentences === 0) return 0;

    return Math.round((passiveSentences / totalSentences) * 100);
  } catch (error) {
    logger.warn('Passive voice check error:', error.message);
    return 0;
  }
};

/**
 * Check plagiarism via LanguageTool API (optional)
 * @param {string} text - Text content
 * @returns {Promise<number|null>} Plagiarism score (0-100) or null if not available
 */
const checkPlagiarism = async (text) => {
  if (!config.languagetool.enabled) {
    return null;
  }

  try {
    // LanguageTool doesn't have built-in plagiarism check
    // This is a placeholder for a dedicated plagiarism API
    // In production, integrate with Turnitin, Copyscape, or similar
    logger.info('Plagiarism check requested but no provider configured');
    return null;
  } catch (error) {
    logger.warn('Plagiarism check error:', error.message);
    return null;
  }
};

/**
 * Run full AI review pipeline on PDF buffer
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<Object>} AI review results
 */
const runAiReview = async (buffer) => {
  const startTime = Date.now();
  logger.info('Starting AI review pipeline');

  // 1. Extract PDF data
  const { text, metadata, pageCount } = await extractPdfData(buffer);

  if (!text || text.trim().length < 50) {
    logger.warn('PDF text extraction yielded insufficient content');
    return {
      readabilityScore: null,
      plagiarismScore: null,
      grammarIssuesCount: 0,
      passiveVoicePercentage: 0,
      checkedAt: new Date(),
      metadata: {
        pageCount,
        extractedMetadata: metadata,
        warning: 'Insufficient text content for analysis',
      },
    };
  }

  // 2. Run analyses in parallel
  const [
    readabilityResult,
    grammarResult,
    passiveVoicePercentage,
    plagiarismScore,
  ] = await Promise.all([
    Promise.resolve(calculateReadability(text)),
    Promise.resolve(checkGrammarAndStyle(text)),
    checkPassiveVoicePercentage(text),
    checkPlagiarism(text),
  ]);

  const duration = Date.now() - startTime;
  logger.info(`AI review completed in ${duration}ms`);

  return {
    readabilityScore: readabilityResult.readabilityScore,
    plagiarismScore,
    grammarIssuesCount: grammarResult.grammarIssuesCount,
    passiveVoicePercentage,
    checkedAt: new Date(),
    metadata: {
      pageCount,
      extractedMetadata: metadata,
      fleschKincaidGradeLevel: readabilityResult.fleschKincaidGradeLevel,
      fleschKincaidReadingEase: readabilityResult.fleschKincaidReadingEase,
      // Qualitative suggestions (ephemeral, not persisted)
      suggestions: grammarResult.suggestions.slice(0, 20), // Limit to 20
    },
  };
};

/**
 * Get qualitative suggestions for display (not persisted)
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<Array>} Suggestions for UI display
 */
const getQualitativeSuggestions = async (buffer) => {
  const { text } = await extractPdfData(buffer);
  const grammarResult = checkGrammarAndStyle(text);
  return grammarResult.suggestions.slice(0, 30);
};

const aiReviewService = {
  extractPdfData,
  calculateReadability,
  checkGrammarAndStyle,
  checkPassiveVoicePercentage,
  checkPlagiarism,
  runAiReview,
  getQualitativeSuggestions,
};

module.exports = { aiReviewService, ...aiReviewService };