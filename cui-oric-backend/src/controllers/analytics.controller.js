/**
 * Analytics & Dashboard Controller
 * Institution-wide and department-scoped statistics
 */

const Publication = require('../models/Publication');
const User = require('../models/User');
const Department = require('../models/Department');
const AuthorProfile = require('../models/AuthorProfile');
const Citation = require('../models/Citation');
const PublicationReview = require('../models/PublicationReview');
const ResearchInterest = require('../models/ResearchInterest');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/apiResponse');
const logger = require('../config/logger');

/**
 * Institution-wide dashboard (ORIC Admin)
 * GET /api/v1/admin/analytics/institution
 */
const getInstitutionDashboard = catchAsync(async (req, res) => {
  const currentYear = new Date().getFullYear();
  const fiveYearsAgo = currentYear - 4;

  // User statistics
  const userStats = await User.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const userRoleStats = await User.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);

  // Publication statistics
  const pubStats = await Publication.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const verifiedPubs = await Publication.countDocuments({ status: 'oric_verified' });
  const totalCitations = await Publication.aggregate([
    { $match: { status: 'oric_verified' } },
    { $group: { _id: null, total: { $sum: '$citationCount' } } },
  ]);

  // Publications by year (last 10 years)
  const pubsByYear = await Publication.aggregate([
    { $match: { status: 'oric_verified', year: { $gte: currentYear - 9 } } },
    { $group: { _id: '$year', count: { $sum: 1 }, citations: { $sum: '$citationCount' } } },
    { $sort: { _id: 1 } },
  ]);

  // Publications by type
  const pubsByType = await Publication.aggregate([
    { $match: { status: 'oric_verified' } },
    { $group: { _id: '$publicationType', count: { $sum: 1 } } },
  ]);

  // Publications by department
  const pubsByDept = await Publication.aggregate([
    { $match: { status: 'oric_verified' } },
    { $group: { _id: '$departmentId', count: { $sum: 1 }, citations: { $sum: '$citationCount' } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
    {
      $lookup: {
        from: 'departments',
        localField: '_id',
        foreignField: '_id',
        as: 'dept',
      },
    },
    { $unwind: '$dept' },
    { $project: { department: '$dept.name', campus: '$dept.campus', count: 1, citations: 1 } },
  ]);

  // Top authors by h-index
  const topAuthors = await AuthorProfile.find()
    .populate('userId', 'name email')
    .populate('departmentId', 'name')
    .sort({ 'metrics.hIndex': -1 })
    .limit(20)
    .select('userId departmentId metrics designation')
    .lean();

  // Review workload (pending reviews)
  const pendingHodReviews = await Publication.countDocuments({ status: 'submitted_to_hod' });
  const pendingOricReviews = await Publication.countDocuments({ status: 'sent_to_oric' });

  // AI review statistics
  const aiReviewStats = await Publication.aggregate([
    { $match: { 'aiReview.checkedAt': { $exists: true } } },
    {
      $group: {
        _id: '$aiReview.virusScanStatus',
        count: { $sum: 1 },
        avgReadability: { $avg: '$aiReview.readabilityScore' },
        avgGrammarIssues: { $avg: '$aiReview.grammarIssuesCount' },
        avgPassiveVoice: { $avg: '$aiReview.passiveVoicePercentage' },
      },
    },
  ]);

  // Citation statistics
  const totalCitationLinks = await Citation.countDocuments();
  const externalCitations = await Citation.countDocuments({ citingPaperId: null });
  const internalCitations = await Citation.countDocuments({ citingPaperId: { $ne: null } });

  // Recent activity
  const recentPublications = await Publication.find({ status: 'oric_verified' })
    .populate('departmentId', 'name')
    .populate('submittedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('title year departmentId submittedBy citationCount')
    .lean();

  return success(res, {
    overview: {
      totalUsers: userStats.reduce((sum, s) => sum + s.count, 0),
      activeUsers: userStats.find((s) => s._id === 'active')?.count || 0,
      pendingApproval: userStats.find((s) => s._id === 'pending_oric_approval')?.count || 0,
      pendingEmailVerification: userStats.find((s) => s._id === 'pending_email_verification')?.count || 0,
      totalPublications: pubStats.reduce((sum, s) => sum + s.count, 0),
      verifiedPublications: verifiedPubs,
      totalCitations: totalCitations[0]?.total || 0,
      averageCitationsPerPaper: verifiedPubs > 0 ? (totalCitations[0]?.total || 0) / verifiedPubs : 0,
    },
    usersByRole: userRoleStats,
    publicationsByStatus: pubStats,
    publicationsByYear: pubsByYear,
    publicationsByType: pubsByType,
    publicationsByDepartment: pubsByDept,
    topAuthors,
    reviewWorkload: {
      pendingHodReviews,
      pendingOricReviews,
    },
    aiReviewStats,
    citationStats: {
      totalLinks: totalCitationLinks,
      externalCitations,
      internalCitations,
    },
    recentActivity: recentPublications,
  }, 'Institution dashboard retrieved');
});

/**
 * Department dashboard (HOD)
 * GET /api/v1/hod/analytics/department
 */
const getDepartmentDashboard = catchAsync(async (req, res) => {
  const department = await Department.findOne({ hodId: req.user._id });
  if (!department) {
    return success(res, null, 'No department assigned');
  }

  const currentYear = new Date().getFullYear();

  // Department users
  const userStats = await User.aggregate([
    { $match: { departmentId: department._id } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);

  // Department publications
  const pubStats = await Publication.aggregate([
    { $match: { departmentId: department._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const verifiedPubs = await Publication.countDocuments({
    departmentId: department._id,
    status: 'oric_verified',
  });

  const totalCitations = await Publication.aggregate([
    { $match: { departmentId: department._id, status: 'oric_verified' } },
    { $group: { _id: null, total: { $sum: '$citationCount' } } },
  ]);

  // Publications by year
  const pubsByYear = await Publication.aggregate([
    { $match: { departmentId: department._id, status: 'oric_verified', year: { $gte: currentYear - 9 } } },
    { $group: { _id: '$year', count: { $sum: 1 }, citations: { $sum: '$citationCount' } } },
    { $sort: { _id: 1 } },
  ]);

  // Top authors in department
  const topAuthors = await AuthorProfile.find({ departmentId: department._id })
    .populate('userId', 'name email role')
    .sort({ 'metrics.hIndex': -1 })
    .limit(10)
    .select('userId metrics designation')
    .lean();

  // Pending reviews for this department
  const pendingHodReviews = await Publication.countDocuments({
    departmentId: department._id,
    status: 'submitted_to_hod',
  });

  const pendingOricReviews = await Publication.countDocuments({
    departmentId: department._id,
    status: 'sent_to_oric',
  });

  // Publications by type
  const pubsByType = await Publication.aggregate([
    { $match: { departmentId: department._id, status: 'oric_verified' } },
    { $group: { _id: '$publicationType', count: { $sum: 1 } } },
  ]);

  // AI review stats for department
  const aiReviewStats = await Publication.aggregate([
    { $match: { departmentId: department._id, 'aiReview.checkedAt': { $exists: true } } },
    {
      $group: {
        _id: '$aiReview.virusScanStatus',
        count: { $sum: 1 },
        avgReadability: { $avg: '$aiReview.readabilityScore' },
        avgGrammarIssues: { $avg: '$aiReview.grammarIssuesCount' },
        avgPassiveVoice: { $avg: '$aiReview.passiveVoicePercentage' },
      },
    },
  ]);

  // Recent publications
  const recentPublications = await Publication.find({
    departmentId: department._id,
    status: 'oric_verified',
  })
    .populate('submittedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('title year submittedBy citationCount publicationType')
    .lean();

  return success(res, {
    department: { id: department._id, name: department.name, campus: department.campus },
    overview: {
      totalUsers: userStats.reduce((sum, s) => sum + s.count, 0),
      facultyCount: userStats.find((s) => s._id === 'faculty')?.count || 0,
      msStudents: userStats.find((s) => s._id === 'ms_student')?.count || 0,
      phdStudents: userStats.find((s) => s._id === 'phd_student')?.count || 0,
      totalPublications: pubStats.reduce((sum, s) => sum + s.count, 0),
      verifiedPublications: verifiedPubs,
      totalCitations: totalCitations[0]?.total || 0,
      averageCitationsPerPaper: verifiedPubs > 0 ? (totalCitations[0]?.total || 0) / verifiedPubs : 0,
    },
    usersByRole: userStats,
    publicationsByStatus: pubStats,
    publicationsByYear: pubsByYear,
    publicationsByType: pubsByType,
    topAuthors,
    reviewWorkload: {
      pendingHodReviews,
      pendingOricReviews,
    },
    aiReviewStats,
    recentActivity: recentPublications,
  }, 'Department dashboard retrieved');
});

/**
 * Moderation dashboard - Stage 1 (HOD review queue)
 * GET /api/v1/admin/moderation/stage1
 */
const getStage1Moderation = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, departmentId } = req.query;

  let query = { status: 'submitted_to_hod' };

  // If HOD, only show their department
  if (req.user.role === 'hod') {
    const department = await Department.findOne({ hodId: req.user._id });
    if (department) query.departmentId = department._id;
  } else if (departmentId) {
    query.departmentId = departmentId;
  }

  const publications = await Publication.find(query)
    .populate('submittedBy', 'name email')
    .populate('departmentId', 'name')
    .populate('authors.authorId', 'name')
    .select('title year publicationType authors aiReview createdAt')
    .sort({ createdAt: 1 }) // Oldest first for queue
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Publication.countDocuments(query);

  return success(res, publications, 'Stage 1 moderation queue', {
    pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * Moderation dashboard - Stage 2 (ORIC review queue)
 * GET /api/v1/admin/moderation/stage2
 */
const getStage2Moderation = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const publications = await Publication.find({ status: 'sent_to_oric' })
    .populate('submittedBy', 'name email')
    .populate('departmentId', 'name')
    .populate('authors.authorId', 'name')
    .select('title year publicationType authors aiReview createdAt lastRemarks')
    .sort({ createdAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Publication.countDocuments({ status: 'sent_to_oric' });

  return success(res, publications, 'Stage 2 moderation queue', {
    pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * Research interests analytics
 * GET /api/v1/analytics/research-interests
 */
const getResearchInterestAnalytics = catchAsync(async (req, res) => {
  const interests = await ResearchInterest.find({ isActive: true })
    .sort({ followerCount: -1 })
    .limit(50)
    .lean();

  // Interest growth over time (would need historical data)
  // For now, return current state

  return success(res, interests, 'Research interest analytics retrieved');
});

/**
 * Collaboration network analytics
 * GET /api/v1/analytics/collaborations
 */
const getCollaborationAnalytics = catchAsync(async (req, res) => {
  const { departmentId } = req.query;

  let query = {};
  if (departmentId) {
    // Get author profiles in department
    const profiles = await AuthorProfile.find({ departmentId }).select('_id');
    const profileIds = profiles.map((p) => p._id);
    query.$or = [{ authorId: { $in: profileIds } }, { coAuthorId: { $in: profileIds } }];
  }

  const topCollaborations = await require('../models/CoAuthorNetwork')
    .find(query)
    .populate('authorId', 'userId')
    .populate('coAuthorId', 'userId')
    .populate({
      path: 'authorId',
      populate: { path: 'userId', select: 'name' },
    })
    .populate({
      path: 'coAuthorId',
      populate: { path: 'userId', select: 'name' },
    })
    .sort({ collaborationCount: -1 })
    .limit(50)
    .lean();

  return success(res, topCollaborations, 'Collaboration analytics retrieved');
});

module.exports = {
  getInstitutionDashboard,
  getDepartmentDashboard,
  getStage1Moderation,
  getStage2Moderation,
  getResearchInterestAnalytics,
  getCollaborationAnalytics,
};