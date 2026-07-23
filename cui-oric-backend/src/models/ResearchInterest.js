/**
 * Research Interest Model
 * Tags for research areas with follower counts and related tags
 */

const mongoose = require('mongoose');

const researchInterestSchema = new mongoose.Schema(
  {
    tag: {
      type: String,
      required: [true, 'Tag is required'],
      trim: true,
      lowercase: true,
      maxlength: [50, 'Tag cannot exceed 50 characters'],
    },
    followerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    relatedTags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: [50, 'Related tag cannot exceed 50 characters'],
      },
    ],
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
researchInterestSchema.index({ tag: 1 }, { unique: true });
researchInterestSchema.index({ followerCount: -1 });
researchInterestSchema.index({ isActive: 1, followerCount: -1 });

// Virtual for followers (users who have this interest)
researchInterestSchema.virtual('followers', {
  ref: 'AuthorProfile',
  localField: 'tag',
  foreignField: 'researchInterests',
});

// Static method: get or create tags
researchInterestSchema.statics.getOrCreateTags = async function (tags) {
  if (!tags || !tags.length) return [];

  const normalizedTags = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const uniqueTags = [...new Set(normalizedTags)];

  // Find existing
  const existing = await this.find({ tag: { $in: uniqueTags } });
  const existingTags = new Set(existing.map((e) => e.tag));

  // Create new ones
  const newTags = uniqueTags.filter((t) => !existingTags.has(t));
  if (newTags.length > 0) {
    const created = await this.insertMany(
      newTags.map((tag) => ({ tag, followerCount: 0 })),
      { ordered: false }
    );
    existing.push(...created);
  }

  return existing;
};

// Static method: increment follower count
researchInterestSchema.statics.incrementFollower = async function (tag) {
  return this.findOneAndUpdate(
    { tag: tag.toLowerCase().trim() },
    { $inc: { followerCount: 1 } },
    { new: true, upsert: true }
  );
};

// Static method: decrement follower count
researchInterestSchema.statics.decrementFollower = async function (tag) {
  return this.findOneAndUpdate(
    { tag: tag.toLowerCase().trim() },
    { $inc: { followerCount: -1 } },
    { new: true }
  );
};

// Static method: get popular tags
researchInterestSchema.statics.getPopular = function (limit = 20) {
  return this.find({ isActive: true })
    .sort({ followerCount: -1 })
    .limit(limit)
    .select('tag followerCount relatedTags');
};

// Static method: search tags
researchInterestSchema.statics.search = function (query, limit = 10) {
  const { escapeRegex } = require('../utils/escapeRegex');
  const regex = new RegExp(escapeRegex(query.trim().toLowerCase()), 'i');
  return this.find({ tag: regex, isActive: true })
    .sort({ followerCount: -1 })
    .limit(limit)
    .select('tag followerCount relatedTags');
};

module.exports = mongoose.model('ResearchInterest', researchInterestSchema);