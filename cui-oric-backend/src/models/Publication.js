/**
 * Publication Model
 * Core entity for research publications with full workflow state machine
 */

const mongoose = require('mongoose');

const authorSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for external authors
    },
    externalName: {
      type: String,
      trim: true,
      maxlength: [100, 'External author name cannot exceed 100 characters'],
      validate: {
        validator: function (v) {
          // Either authorId or externalName must be present
          return this.authorId || (v && v.length > 0);
        },
        message: 'Either authorId or externalName is required',
      },
    },
    order: {
      type: Number,
      required: true,
      min: 1,
    },
    isCorresponding: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const venueSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Venue name is required'],
      trim: true,
      maxlength: [200, 'Venue name cannot exceed 200 characters'],
    },
    type: {
      type: String,
      enum: {
        values: ['journal', 'conference', 'book_publisher'],
        message: 'Invalid venue type',
      },
      required: [true, 'Venue type is required'],
    },
    volume: {
      type: String,
      trim: true,
      maxlength: [20, 'Volume cannot exceed 20 characters'],
    },
    issue: {
      type: String,
      trim: true,
      maxlength: [20, 'Issue cannot exceed 20 characters'],
    },
    pages: {
      type: String,
      trim: true,
      maxlength: [30, 'Pages cannot exceed 30 characters'],
    },
    impactFactor: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  { _id: false }
);

const aiReviewSchema = new mongoose.Schema(
  {
    virusScanStatus: {
      type: String,
      enum: {
        values: ['pending', 'clean', 'infected', 'skipped'],
        message: 'Invalid virus scan status',
      },
      default: 'pending',
    },
    readabilityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    plagiarismScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    grammarIssuesCount: {
      type: Number,
      min: 0,
      default: null,
    },
    passiveVoicePercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    checkedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const publicationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [500, 'Title cannot exceed 500 characters'],
    },
    abstract: {
      type: String,
      required: [true, 'Abstract is required'],
      trim: true,
      maxlength: [5000, 'Abstract cannot exceed 5000 characters'],
    },
    publicationType: {
      type: String,
      enum: {
        values: [
          'journal_article',
          'conference_paper',
          'book',
          'book_chapter',
          'thesis',
          'preprint',
          'patent',
        ],
        message: 'Invalid publication type',
      },
      required: [true, 'Publication type is required'],
    },
    authors: {
      type: [authorSchema],
      required: [true, 'At least one author is required'],
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: 'At least one author is required',
      },
    },
    venue: {
      type: venueSchema,
      required: [true, 'Venue information is required'],
    },
    year: {
      type: Number,
      required: [true, 'Publication year is required'],
      min: [1900, 'Year must be >= 1900'],
      max: [new Date().getFullYear() + 1, 'Year cannot be in the future'],
    },
    publicationDate: {
      type: Date,
      default: null,
    },
    doi: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(v);
        },
        message: 'Invalid DOI format',
      },
    },
    url: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'URL must be a valid HTTP/HTTPS URL',
      },
    },
    pdfFile: {
      type: String, // S3 key
      trim: true,
      default: null,
    },
    citationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    citedByIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Publication',
      },
    ],
    keywords: [
      {
        type: String,
        trim: true,
        maxlength: [50, 'Keyword cannot exceed 50 characters'],
      },
    ],
    status: {
      type: String,
      enum: {
        values: [
          'draft',
          'submitted_to_hod',
          'hod_approved',
          'hod_rejected',
          'sent_to_oric',
          'oric_verified',
          'oric_rejected',
        ],
        message: 'Invalid publication status',
      },
      default: 'draft',
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    lastRemarks: {
      type: String,
      trim: true,
      maxlength: [1000, 'Remarks cannot exceed 1000 characters'],
      default: '',
    },
    aiReview: {
      type: aiReviewSchema,
      default: () => ({}),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes (exact specification)
publicationSchema.index(
  { departmentId: 1, status: 1, year: -1 },
  { name: 'idx_pub_dept_status_year' }
);
publicationSchema.index(
  { 'authors.authorId': 1, status: 1 },
  { name: 'idx_pub_author_status' }
);
publicationSchema.index(
  { title: 'text', abstract: 'text', keywords: 'text' },
  { name: 'idx_pub_text_search', weights: { title: 10, keywords: 5, abstract: 1 } }
);

// Additional useful indexes
publicationSchema.index({ doi: 1 }, { sparse: true });
publicationSchema.index({ status: 1, createdAt: -1 });
publicationSchema.index({ submittedBy: 1, status: 1 });
publicationSchema.index({ 'venue.name': 1 });

// Virtual for corresponding author
publicationSchema.virtual('correspondingAuthor').get(function () {
  return this.authors.find((a) => a.isCorresponding) || this.authors[0];
});

// Virtual for internal authors (with userId)
publicationSchema.virtual('internalAuthors').get(function () {
  return this.authors.filter((a) => a.authorId);
});

// Virtual for external authors (without userId)
publicationSchema.virtual('externalAuthors').get(function () {
  return this.authors.filter((a) => !a.authorId);
});

// Virtual for department
publicationSchema.virtual('department', {
  ref: 'Department',
  localField: 'departmentId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for submitter
publicationSchema.virtual('submitter', {
  ref: 'User',
  localField: 'submittedBy',
  foreignField: '_id',
  justOne: true,
});

// Virtual for creator
publicationSchema.virtual('creator', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true,
});

// Instance method: check if user is an author
publicationSchema.methods.hasAuthor = function (userId) {
  return this.authors.some((a) => a.authorId && a.authorId.toString() === userId.toString());
};

// Instance method: check if user is corresponding author
publicationSchema.methods.isCorrespondingAuthor = function (userId) {
  return this.authors.some(
    (a) => a.authorId && a.authorId.toString() === userId.toString() && a.isCorresponding
  );
};

// Instance method: get author order for a user
publicationSchema.methods.getAuthorOrder = function (userId) {
  const author = this.authors.find((a) => a.authorId && a.authorId.toString() === userId.toString());
  return author ? author.order : null;
};

// Static method: get allowed status transitions (state machine)
publicationSchema.statics.getAllowedTransitions = function () {
  return {
    draft: ['submitted_to_hod'],
    submitted_to_hod: ['hod_approved', 'hod_rejected', 'sent_to_oric'],
    hod_approved: ['sent_to_oric'], // Auto-transition, but explicit for clarity
    sent_to_oric: ['oric_verified', 'oric_rejected'],
    hod_rejected: ['draft'], // Can resubmit as draft
    oric_rejected: ['draft'], // Can resubmit as draft
    oric_verified: [], // Terminal state
  };
};

// Static method: validate status transition
publicationSchema.statics.isValidTransition = function (fromStatus, toStatus) {
  const transitions = this.getAllowedTransitions();
  return transitions[fromStatus]?.includes(toStatus) ?? false;
};

// Pre-save: auto-set publicationDate if not provided and year is set
publicationSchema.pre('save', function (next) {
  if (this.isNew && !this.publicationDate && this.year) {
    this.publicationDate = new Date(this.year, 0, 1); // Jan 1 of the year
  }
  next();
});

module.exports = mongoose.model('Publication', publicationSchema);