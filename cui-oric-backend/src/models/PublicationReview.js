/**
 * Publication Review Model
 * Append-only audit trail for all publication status transitions
 */

const mongoose = require('mongoose');
const { BadRequestError } = require('../utils/AppError');

const publicationReviewSchema = new mongoose.Schema(
  {
    publicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Publication',
      required: true,
      index: true,
    },
    stage: {
      type: String,
      enum: {
        values: ['hod_review', 'oric_review'],
        message: 'Invalid review stage',
      },
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    decision: {
      type: String,
      enum: {
        values: ['submitted', 'approved', 'rejected', 'returned_for_correction'],
        message: 'Invalid decision',
      },
      required: true,
    },
    remarks: {
      type: String,
      required: [true, 'Remarks are required'],
      trim: true,
      maxlength: [2000, 'Remarks cannot exceed 2000 characters'],
    },
    reviewedAt: {
      type: Date,
      default: Date.now,
      immutable: true, // Append-only: cannot be modified after creation
    },
    previousStatus: {
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
        message: 'Invalid previous status',
      },
      required: true,
    },
    newStatus: {
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
        message: 'Invalid new status',
      },
      required: true,
    },
  },
  {
    timestamps: false, // We use reviewedAt instead
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
publicationReviewSchema.index({ publicationId: 1, reviewedAt: -1 });
publicationReviewSchema.index({ reviewedBy: 1, reviewedAt: -1 });
publicationReviewSchema.index({ stage: 1, decision: 1 });

// Virtual for publication
publicationReviewSchema.virtual('publication', {
  ref: 'Publication',
  localField: 'publicationId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for reviewer
publicationReviewSchema.virtual('reviewer', {
  ref: 'User',
  localField: 'reviewedBy',
  foreignField: '_id',
  justOne: true,
});

// Ensure append-only: prevent updates to existing reviews
publicationReviewSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update && (update.$set || update.$unset || update.$inc)) {
    // Allow only adding new documents, not updating existing
    return next(new Error('Publication reviews are append-only and cannot be updated'));
  }
  next();
});

publicationReviewSchema.pre('updateOne', function (next) {
  return next(new Error('Publication reviews are append-only and cannot be updated'));
});

publicationReviewSchema.pre('updateMany', function (next) {
  return next(new Error('Publication reviews are append-only and cannot be updated'));
});

// Static method: create review record
publicationReviewSchema.statics.createReview = async function (data) {
  const {
    publicationId,
    stage,
    reviewedBy,
    decision,
    remarks,
    previousStatus,
    newStatus,
  } = data;

  // Validate transition
  const Publication = mongoose.model('Publication');
  if (!Publication.isValidTransition(previousStatus, newStatus)) {
    throw new BadRequestError(`Invalid status transition: ${previousStatus} → ${newStatus}`);
  }

  const review = new this({
    publicationId,
    stage,
    reviewedBy,
    decision,
    remarks,
    previousStatus,
    newStatus,
    reviewedAt: new Date(),
  });

  return review.save();
};

// Static method: get review history for a publication
publicationReviewSchema.statics.getHistory = function (publicationId) {
  return this.find({ publicationId })
    .populate('reviewedBy', 'name email role')
    .sort({ reviewedAt: 1 });
};

// Static method: get reviews by reviewer
publicationReviewSchema.statics.getByReviewer = function (reviewerId, options = {}) {
  const { page = 1, limit = 20, stage } = options;
  const query = { reviewedBy: reviewerId };
  if (stage) query.stage = stage;

  return this.find(query)
    .populate('publicationId', 'title status year')
    .sort({ reviewedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

module.exports = mongoose.model('PublicationReview', publicationReviewSchema);