/**
 * Search Controller
 * Full-text search and discovery for publications
 */
const User = require("../models/User");
const Publication = require("../models/Publication");
const Department = require("../models/Department");
const ResearchInterest = require("../models/ResearchInterest");
const AuthorProfile = require("../models/AuthorProfile");
const catchAsync = require("../utils/catchAsync");
const { success, paginationMeta } = require("../utils/apiResponse");
const { escapeRegex } = require("../utils/escapeRegex");

/**
 * Search publications
 * GET /api/v1/search/publications
 */
const searchPublications = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    q, // full-text search query
    year,
    citationCount,
    departmentId,
    researchInterest,
    publicationType,
    sortBy = "relevance", // relevance, year, citationCount, title
    sortOrder = "desc",
  } = req.query;

  // Base query: only verified publications for public search
  let query = { status: "oric_verified" };

  // Full-text search
  if (q) {
    query.$text = { $search: q };
  }

  // Filters
  if (year) query.year = parseInt(year);
  if (citationCount) query.citationCount = { $gte: parseInt(citationCount) };
  if (departmentId) query.departmentId = departmentId;
  if (publicationType) query.publicationType = publicationType;

  // Research interest filter (match authors' interests)
  if (researchInterest) {
    // Find author profiles with this interest
    const profiles = await AuthorProfile.find({
      researchInterests: researchInterest.toLowerCase().trim(),
    }).select("userId");

    const authorIds = profiles.map((p) => p.userId);
    if (authorIds.length > 0) {
      query["authors.authorId"] = { $in: authorIds };
    } else {
      // No authors with this interest
      return success(
        res,
        [],
        "No publications found",
        paginationMeta(page, limit, 0, 0),
      );
    }
  }

  // Determine sort
  let sort = {};
  if (q && sortBy === "relevance") {
    sort = { score: { $meta: "textScore" } };
  } else {
    const sortField = sortBy === "citationCount" ? "citationCount" : sortBy;
    sort[sortField] = sortOrder === "desc" ? -1 : 1;
  }

  // Build projection
  let projection = {};
  if (q && sortBy === "relevance") {
    projection.score = { $meta: "textScore" };
  }

  // Execute query
  const publications = await Publication.find(query, projection)
    .populate("departmentId", "name campus")
    .populate("authors.authorId", "name email")
    .select("-aiReview -abstract") // Exclude heavy fields from search results
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Publication.countDocuments(query);

  return success(
    res,
    publications,
    "Search results",
    paginationMeta(page, limit, total, Math.ceil(total / limit)),
  );
});

/**
 * Get search suggestions (autocomplete)
 * GET /api/v1/search/suggestions
 */
const getSuggestions = catchAsync(async (req, res) => {
  const { q, type = "all", limit = 10 } = req.query;

  if (!q || q.length < 2) {
    return success(res, [], "Suggestions retrieved");
  }

  const regex = new RegExp(escapeRegex(q), "i");
  const suggestions = {
    titles: [],
    authors: [],
    venues: [],
    keywords: [],
    researchInterests: [],
  };

  // Title suggestions
  if (type === "all" || type === "titles") {
    const titleResults = await Publication.find(
      { status: "oric_verified", title: regex },
      { title: 1 },
    )
      .limit(limit)
      .lean();
    suggestions.titles = [...new Set(titleResults.map((p) => p.title))].slice(
      0,
      limit,
    );
  }

  // Author suggestions
  if (type === "all" || type === "authors") {
    const authorResults = await AuthorProfile.find({
      userId: {
        $in: await User.find({ name: regex, status: "active" })
          .select("_id")
          .lean()
          .then((u) => u.map((x) => x._id)),
      },
    })
      .populate("userId", "name")
      .limit(limit)
      .lean();
    suggestions.authors = authorResults
      .map((p) => p.userId?.name)
      .filter(Boolean)
      .slice(0, limit);
  }

  // Venue suggestions
  if (type === "all" || type === "venues") {
    const venueResults = await Publication.find(
      { status: "oric_verified", "venue.name": regex },
      { "venue.name": 1 },
    )
      .limit(limit)
      .lean();
    suggestions.venues = [...new Set(venueResults.map((p) => p.venue?.name))]
      .filter(Boolean)
      .slice(0, limit);
  }

  // Keyword suggestions
  if (type === "all" || type === "keywords") {
    const keywordResults = await Publication.find(
      { status: "oric_verified", keywords: regex },
      { keywords: 1 },
    )
      .limit(limit)
      .lean();
    const keywords = new Set();
    keywordResults.forEach((p) => p.keywords.forEach((k) => keywords.add(k)));
    suggestions.keywords = Array.from(keywords).slice(0, limit);
  }

  // Research interest suggestions
  if (type === "all" || type === "researchInterests") {
    const interestResults = await ResearchInterest.find({
      tag: regex,
      isActive: true,
    })
      .sort({ followerCount: -1 })
      .limit(limit)
      .select("tag followerCount")
      .lean();
    suggestions.researchInterests = interestResults;
  }

  return success(res, suggestions, "Suggestions retrieved");
});

/**
 * Get filter options for search UI
 * GET /api/v1/search/filters
 */
const getFilters = catchAsync(async (req, res) => {
  // Years with publication counts
  const years = await Publication.aggregate([
    { $match: { status: "oric_verified" } },
    { $group: { _id: "$year", count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
  ]);

  // Publication types with counts
  const types = await Publication.aggregate([
    { $match: { status: "oric_verified" } },
    { $group: { _id: "$publicationType", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Departments with counts
  const departments = await Publication.aggregate([
    { $match: { status: "oric_verified" } },
    { $group: { _id: "$departmentId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 50 },
    {
      $lookup: {
        from: "departments",
        localField: "_id",
        foreignField: "_id",
        as: "dept",
      },
    },
    { $unwind: "$dept" },
    {
      $project: {
        _id: 1,
        name: "$dept.name",
        campus: "$dept.campus",
        count: 1,
      },
    },
  ]);

  // Top research interests
  const interests = await ResearchInterest.find({ isActive: true })
    .sort({ followerCount: -1 })
    .limit(30)
    .select("tag followerCount")
    .lean();

  return success(
    res,
    { years, types, departments, interests },
    "Filters retrieved",
  );
});

/**
 * Advanced search with multiple criteria
 * POST /api/v1/search/advanced
 */
const advancedSearch = catchAsync(async (req, res) => {
  let {
    page = 1,
    limit = 20,
    title,
    author,
    venue,
    keyword,
    doi,
    yearFrom,
    yearTo,
    citationCountMin,
    citationCountMax,
    departmentId,
    publicationType,
    researchInterests,
    sortBy = "year",
    sortOrder = "desc",
  } = req.body;

  // page/limit come from the request body, which may deliver them as
  // strings depending on the client — coerce defensively before they
  // reach .skip()/.limit(), which the MongoDB driver expects as numbers.
  page = parseInt(page, 10) || 1;
  limit = Math.min(parseInt(limit, 10) || 20, 100);

  let query = { status: "oric_verified" };

  // Build text search conditions
  const textConditions = [];

  if (title)
    textConditions.push({
      title: { $regex: escapeRegex(title), $options: "i" },
    });
  if (venue)
    textConditions.push({
      "venue.name": { $regex: escapeRegex(venue), $options: "i" },
    });
  if (keyword)
    textConditions.push({
      keywords: { $regex: escapeRegex(keyword), $options: "i" },
    });
  if (doi)
    textConditions.push({ doi: { $regex: escapeRegex(doi), $options: "i" } });

  if (author) {
    // Search authors by name
    const authorUsers = await User.find({
      name: { $regex: escapeRegex(author), $options: "i" },
      status: "active",
    }).select("_id");
    const authorIds = authorUsers.map((u) => u._id);
    if (authorIds.length > 0) {
      textConditions.push({ "authors.authorId": { $in: authorIds } });
    } else {
      textConditions.push({
        "authors.externalName": { $regex: escapeRegex(author), $options: "i" },
      });
    }
  }

  if (textConditions.length > 0) {
    query.$and = textConditions;
  }

  // Year range
  if (yearFrom || yearTo) {
    query.year = {};
    if (yearFrom) query.year.$gte = parseInt(yearFrom);
    if (yearTo) query.year.$lte = parseInt(yearTo);
  }

  // Citation count range
  if (citationCountMin || citationCountMax) {
    query.citationCount = {};
    if (citationCountMin) query.citationCount.$gte = parseInt(citationCountMin);
    if (citationCountMax) query.citationCount.$lte = parseInt(citationCountMax);
  }

  // Other filters
  if (departmentId) query.departmentId = departmentId;
  if (publicationType) query.publicationType = publicationType;
  if (researchInterests && researchInterests.length > 0) {
    const profiles = await AuthorProfile.find({
      researchInterests: {
        $in: researchInterests.map((r) => r.toLowerCase().trim()),
      },
    }).select("userId");
    const authorIds = profiles.map((p) => p.userId);
    if (authorIds.length > 0) {
      query["authors.authorId"] = { $in: authorIds };
    }
  }

  // Sort
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const publications = await Publication.find(query)
    .populate("departmentId", "name campus")
    .populate("authors.authorId", "name email")
    .select("-aiReview -abstract")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Publication.countDocuments(query);

  return success(
    res,
    publications,
    "Advanced search results",
    paginationMeta(page, limit, total, Math.ceil(total / limit)),
  );
});

module.exports = {
  searchPublications,
  getSuggestions,
  getFilters,
  advancedSearch,
};
