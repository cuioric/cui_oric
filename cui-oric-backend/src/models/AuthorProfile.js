/**
 * Author Profile Model
 * Extended profile for faculty/students with research metrics and co-author network
 */

const mongoose = require('mongoose');

const coAuthorSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuthorProfile',
      required: true,
    },
    sharedPublications: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const metricsSchema = new mongoose.Schema(
  {
    totalCitations: {
      type: Number,
      default: 0,
      min: 0,
    },
    hIndex: {
      type: Number,
      default: 0,
      min: 0,
    },
    i10Index: {
      type: Number,
      default: 0,
      min: 0,
    },
    citationsSince5Years: {
      type: Number,
      default: 0,
      min: 0,
    },
    hIndexSince5Years: {
      type: Number,
      default: 0,
      min: 0,
    },
    i10IndexSince5Years: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastCalculatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const authorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    photoUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Photo URL must be a valid HTTP/HTTPS URL',
      },
    },
    // Internal-only: the S3 object key backing photoUrl when the photo was
    // uploaded through our own /photo endpoint (vs. an externally hosted URL
    // the user pasted in directly). Never exposed to clients — used purely
    // so we know what to delete from S3 when the photo is replaced/removed.
    photoKey: {
      type: String,
      select: false,
    },
    designation: {
      type: String,
      trim: true,
      maxlength: [100, 'Designation cannot exceed 100 characters'],
    },
    affiliation: {
      type: String,
      trim: true,
      maxlength: [200, 'Affiliation cannot exceed 200 characters'],
      default: 'COMSATS University Islamabad, Sahiwal Campus',
    },
    researchInterests: [
      {
        type: String,
        trim: true,
        maxlength: [50, 'Research interest tag cannot exceed 50 characters'],
      },
    ],
    homepageUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Homepage URL must be a valid HTTP/HTTPS URL',
      },
    },
    orcidId: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(v);
        },
        message: 'Invalid ORCID format (XXXX-XXXX-XXXX-XXXX)',
      },
      sparse: true, // Allow multiple nulls but unique non-null
    },
    googleScholarId: {
      type: String,
      trim: true,
      sparse: true,
    },
    verifiedEmail: {
      type: Boolean,
      default: false,
    },
    metrics: {
      type: metricsSchema,
      default: () => ({}),
    },
    coAuthors: [coAuthorSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
authorProfileSchema.index({ userId: 1 }, { unique: true });
authorProfileSchema.index({ departmentId: 1 });
authorProfileSchema.index({ 'metrics.hIndex': -1 });
authorProfileSchema.index({ researchInterests: 1 });

// Virtual for user details
authorProfileSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for department details
authorProfileSchema.virtual('department', {
  ref: 'Department',
  localField: 'departmentId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for verified publications count
authorProfileSchema.virtual('verifiedPublicationsCount', {
  ref: 'Publication',
  localField: 'userId',
  foreignField: 'authors.authorId',
  count: true,
  match: { status: 'oric_verified' },
});

// Instance method: update co-author network
authorProfileSchema.methods.updateCoAuthor = async function (coAuthorId, sharedPubId) {
  const existing = this.coAuthors.find((ca) => ca.authorId.toString() === coAuthorId.toString());
  if (existing) {
    existing.sharedPublications += 1;
  } else {
    this.coAuthors.push({ authorId: coAuthorId, sharedPublications: 1 });
  }
  return this.save();
};

// Static method: recompute metrics for an author
authorProfileSchema.statics.recomputeMetrics = async function (authorProfileId) {
  const Publication = mongoose.model('Publication');
  const Citation = mongoose.model('Citation');

  const profile = await this.findById(authorProfileId).populate('userId');
  if (!profile) throw new Error('Author profile not found');

  // Get all verified publications where this author is listed
  const publications = await Publication.find({
    'authors.authorId': profile.userId._id,
    status: 'oric_verified',
  }).select('_id citationCount year citedByIds');

  const pubIds = publications.map((p) => p._id);
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  // Calculate total citations
  const totalCitations = publications.reduce((sum, p) => sum + (p.citationCount || 0), 0);

  // Calculate h-index
  const citationCounts = publications.map((p) => p.citationCount || 0).sort((a, b) => b - a);
  let hIndex = 0;
  for (let i = 0; i < citationCounts.length; i++) {
    if (citationCounts[i] >= i + 1) hIndex = i + 1;
    else break;
  }

  // Calculate i10-index
  const i10Index = citationCounts.filter((c) => c >= 10).length;

  // 5-year metrics
  const recentPublications = publications.filter((p) => p.year && p.year >= fiveYearsAgo.getFullYear());
  const recentCitationCounts = recentPublications.map((p) => p.citationCount || 0).sort((a, b) => b - a);
  const citationsSince5Years = recentPublications.reduce((sum, p) => sum + (p.citationCount || 0), 0);

  let hIndexSince5Years = 0;
  for (let i = 0; i < recentCitationCounts.length; i++) {
    if (recentCitationCounts[i] >= i + 1) hIndexSince5Years = i + 1;
    else break;
  }

  const i10IndexSince5Years = recentCitationCounts.filter((c) => c >= 10).length;

  // Update profile
  profile.metrics = {
    totalCitations,
    hIndex,
    i10Index,
    citationsSince5Years,
    hIndexSince5Years,
    i10IndexSince5Years,
    lastCalculatedAt: new Date(),
  };

  // Recompute co-authors from publications
  const coAuthorMap = new Map();
  for (const pub of publications) {
    for (const author of pub.authors) {
      if (author.authorId && author.authorId.toString() !== profile.userId._id.toString()) {
        const key = author.authorId.toString();
        if (!coAuthorMap.has(key)) {
          coAuthorMap.set(key, { authorId: author.authorId, sharedPublications: 0 });
        }
        coAuthorMap.get(key).sharedPublications += 1;
      }
    }
  }

  profile.coAuthors = Array.from(coAuthorMap.values()).sort((a, b) => b.sharedPublications - a.sharedPublications);

  await profile.save({ validateBeforeSave: false });
  return profile;
};

module.exports = mongoose.model('AuthorProfile', authorProfileSchema);