/**
 * Citation Model
 * Tracks citation relationships between publications (internal and external)
 */

const mongoose = require('mongoose');

const externalCitationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'External citation title is required'],
      trim: true,
      maxlength: [500, 'Title cannot exceed 500 characters'],
    },
    authors: [
      {
        type: String,
        trim: true,
        maxlength: [100, 'Author name cannot exceed 100 characters'],
      },
    ],
    venue: {
      type: String,
      trim: true,
      maxlength: [200, 'Venue cannot exceed 200 characters'],
    },
    year: {
      type: Number,
      min: [1900, 'Year must be >= 1900'],
      max: [new Date().getFullYear() + 1, 'Year cannot be in the future'],
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
  },
  { _id: false }
);

const citationSchema = new mongoose.Schema(
  {
    citingPaperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Publication',
      default: null, // null for external citing papers
    },
    citedPaperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Publication',
      required: true,
      index: true,
    },
    citingPaperExternal: {
      type: externalCitationSchema,
      default: null,
      validate: {
        validator: function (v) {
          // Either citingPaperId or citingPaperExternal must be present
          return this.citingPaperId || (v && v.title);
        },
        message: 'Either citingPaperId or citingPaperExternal is required',
      },
    },
    addedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false, // We use addedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index (exact specification)
citationSchema.index(
  { citedPaperId: 1, citingPaperId: 1 },
  { name: 'idx_citation_cited_citing', unique: true, sparse: true }
);

// Additional indexes
citationSchema.index({ citingPaperId: 1 });
citationSchema.index({ addedAt: -1 });

// Virtual for citing paper (internal)
citationSchema.virtual('citingPaper', {
  ref: 'Publication',
  localField: 'citingPaperId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for cited paper
citationSchema.virtual('citedPaper', {
  ref: 'Publication',
  localField: 'citedPaperId',
  foreignField: '_id',
  justOne: true,
});

// Pre-save: validate that citing and cited papers are different
citationSchema.pre('save', function (next) {
  if (
    this.citingPaperId &&
    this.citedPaperId &&
    this.citingPaperId.toString() === this.citedPaperId.toString()
  ) {
    return next(new Error('A paper cannot cite itself'));
  }
  next();
});

// Static method: add citation and update counts
citationSchema.statics.addCitation = async function (data) {
  const Publication = mongoose.model('Publication');

  const { citingPaperId, citedPaperId, citingPaperExternal } = data;

  // Create citation record
  const citation = new this({
    citingPaperId,
    citedPaperId,
    citingPaperExternal,
  });

  await citation.save();

  // Update cited paper's citation count and citedByIds
  await Publication.findByIdAndUpdate(citedPaperId, {
    $inc: { citationCount: 1 },
    $addToSet: { citedByIds: citingPaperId },
  });

  // If citing paper is internal, update its citedByIds reference (optional, for graph)
  if (citingPaperId) {
    await Publication.findByIdAndUpdate(citingPaperId, {
      $addToSet: { citedByIds: citedPaperId }, // This creates a bidirectional link for graph traversal
    });
  }

  return citation;
};

// Static method: get citation graph (incoming + outgoing)
citationSchema.statics.getCitationGraph = async function (publicationId, depth = 1) {
  const Publication = mongoose.model('Publication');

  const results = {
    paper: await Publication.findById(publicationId).select('title year authors venue'),
    incoming: [], // Papers that cite this paper
    outgoing: [], // Papers this paper cites
  };

  if (!results.paper) {
    throw new Error('Publication not found');
  }

  // Get incoming citations (papers citing this paper)
  const incomingCitations = await this.find({ citedPaperId: publicationId })
    .populate('citingPaperId', 'title year authors venue.name')
    .populate({
      path: 'citingPaperExternal',
      select: 'title authors venue year',
    })
    .sort({ addedAt: -1 });

  results.incoming = incomingCitations.map((c) => ({
    citationId: c._id,
    paper: c.citingPaperId || c.citingPaperExternal,
    isInternal: !!c.citingPaperId,
    addedAt: c.addedAt,
  }));

  // Get outgoing citations (papers this paper cites) - only if internal
  if (results.paper._id) {
    const outgoingCitations = await this.find({ citingPaperId: publicationId })
      .populate('citedPaperId', 'title year authors venue.name')
      .sort({ addedAt: -1 });

    results.outgoing = outgoingCitations.map((c) => ({
      citationId: c._id,
      paper: c.citedPaperId,
      isInternal: true,
      addedAt: c.addedAt,
    }));
  }

  return results;
};

// Static method: recompute citation count for a paper
citationSchema.statics.recomputeCitationCount = async function (publicationId) {
  const Publication = mongoose.model('Publication');

  const count = await this.countDocuments({ citedPaperId: publicationId });

  await Publication.findByIdAndUpdate(publicationId, {
    citationCount: count,
  });

  return count;
};

module.exports = mongoose.model('Citation', citationSchema);