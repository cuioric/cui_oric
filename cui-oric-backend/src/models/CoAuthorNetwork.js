/**
 * Co-Author Network Model
 * Denormalized collaboration graph for fast querying and visualization
 */

const mongoose = require('mongoose');

const coAuthorNetworkSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuthorProfile',
      required: true,
      index: true,
    },
    coAuthorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuthorProfile',
      required: true,
      index: true,
    },
    sharedPublicationIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Publication',
      },
    ],
    collaborationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    firstCollaborationYear: {
      type: Number,
      default: null,
    },
    lastCollaborationYear: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for unique author-coauthor pairs (bidirectional prevention)
coAuthorNetworkSchema.index(
  { authorId: 1, coAuthorId: 1 },
  { name: 'idx_coauthor_pair', unique: true }
);

// Additional indexes
coAuthorNetworkSchema.index({ authorId: 1, collaborationCount: -1 });
coAuthorNetworkSchema.index({ coAuthorId: 1, collaborationCount: -1 });

// Virtual for author
coAuthorNetworkSchema.virtual('author', {
  ref: 'AuthorProfile',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for co-author
coAuthorNetworkSchema.virtual('coAuthor', {
  ref: 'AuthorProfile',
  localField: 'coAuthorId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for shared publications
coAuthorNetworkSchema.virtual('sharedPublications', {
  ref: 'Publication',
  localField: 'sharedPublicationIds',
  foreignField: '_id',
});

// Pre-save: ensure authorId < coAuthorId to prevent duplicates (canonical ordering)
coAuthorNetworkSchema.pre('save', function (next) {
  if (this.authorId.toString() > this.coAuthorId.toString()) {
    // Swap to maintain canonical order
    [this.authorId, this.coAuthorId] = [this.coAuthorId, this.authorId];
  }
  next();
});

// Static method: add/update collaboration
coAuthorNetworkSchema.statics.recordCollaboration = async function (
  authorId,
  coAuthorId,
  publicationId,
  year
) {
  if (authorId.toString() === coAuthorId.toString()) return null;

  // Ensure canonical ordering
  const [a1, a2] = [authorId, coAuthorId].sort((a, b) => a.toString().localeCompare(b.toString()));

  const update = {
    $inc: { collaborationCount: 1 },
    $addToSet: { sharedPublicationIds: publicationId },
  };

  if (year) {
    update.$min = { firstCollaborationYear: year };
    update.$max = { lastCollaborationYear: year };
  }

  const result = await this.findOneAndUpdate(
    { authorId: a1, coAuthorId: a2 },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return result;
};

// Static method: get co-authors for an author
coAuthorNetworkSchema.statics.getCoAuthors = async function (authorId, options = {}) {
  const { limit = 50, minCollaborations = 1, sortBy = 'collaborationCount' } = options;

  // Find both directions (authorId and coAuthorId)
  const [asAuthor, asCoAuthor] = await Promise.all([
    this.find({ authorId, collaborationCount: { $gte: minCollaborations } })
      .populate('coAuthorId', 'userId departmentId')
      .populate({
        path: 'coAuthorId',
        populate: { path: 'userId', select: 'name email' },
      })
      .sort({ [sortBy]: -1 })
      .limit(limit),
    this.find({ coAuthorId: authorId, collaborationCount: { $gte: minCollaborations } })
      .populate('authorId', 'userId departmentId')
      .populate({
        path: 'authorId',
        populate: { path: 'userId', select: 'name email' },
      })
      .sort({ [sortBy]: -1 })
      .limit(limit),
  ]);

  // Merge and deduplicate
  const coAuthorMap = new Map();

  for (const record of asAuthor) {
    const key = record.coAuthorId._id.toString();
    if (!coAuthorMap.has(key)) {
      coAuthorMap.set(key, {
        authorProfile: record.coAuthorId,
        collaborationCount: record.collaborationCount,
        sharedPublicationIds: record.sharedPublicationIds,
        firstCollaborationYear: record.firstCollaborationYear,
        lastCollaborationYear: record.lastCollaborationYear,
      });
    }
  }

  for (const record of asCoAuthor) {
    const key = record.authorId._id.toString();
    if (!coAuthorMap.has(key)) {
      coAuthorMap.set(key, {
        authorProfile: record.authorId,
        collaborationCount: record.collaborationCount,
        sharedPublicationIds: record.sharedPublicationIds,
        firstCollaborationYear: record.firstCollaborationYear,
        lastCollaborationYear: record.lastCollaborationYear,
      });
    }
  }

  // Convert to array and sort
  const coAuthors = Array.from(coAuthorMap.values())
    .sort((a, b) => b.collaborationCount - a.collaborationCount)
    .slice(0, limit);

  return coAuthors;
};

// Static method: get collaboration network for visualization
coAuthorNetworkSchema.statics.getNetwork = async function (authorId, depth = 1) {
  if (depth < 1 || depth > 2) depth = 1;

  const nodes = new Map();
  const edges = [];

  // Start with the central author
  const centralAuthor = await mongoose.model('AuthorProfile').findById(authorId).lean();
  if (!centralAuthor) throw new Error('Author not found');

  nodes.set(authorId.toString(), {
    id: authorId.toString(),
    label: centralAuthor.userId?.name || 'Unknown',
    isCentral: true,
    metrics: centralAuthor.metrics,
  });

  // Get direct co-authors (depth 1)
  const directCoAuthors = await this.getCoAuthors(authorId, { limit: 100 });

  for (const coAuthor of directCoAuthors) {
    const coAuthorId = coAuthor.authorProfile._id.toString();
    nodes.set(coAuthorId, {
      id: coAuthorId,
      label: coAuthor.authorProfile.userId?.name || 'Unknown',
      isCentral: false,
      metrics: coAuthor.authorProfile.metrics,
      collaborationCount: coAuthor.collaborationCount,
    });

    edges.push({
      source: authorId.toString(),
      target: coAuthorId,
      weight: coAuthor.collaborationCount,
      sharedPublications: coAuthor.sharedPublicationIds.length,
    });
  }

  // If depth 2, get co-authors of co-authors
  if (depth === 2) {
    const coAuthorIds = Array.from(nodes.keys()).filter((id) => id !== authorId.toString());

    for (const coAuthorId of coAuthorIds.slice(0, 20)) {
      // Limit to prevent explosion
      const secondDegree = await this.getCoAuthors(coAuthorId, { limit: 10 });

      for (const secondCoAuthor of secondDegree) {
        const secondId = secondCoAuthor.authorProfile._id.toString();
        if (!nodes.has(secondId)) {
          nodes.set(secondId, {
            id: secondId,
            label: secondCoAuthor.authorProfile.userId?.name || 'Unknown',
            isCentral: false,
            metrics: secondCoAuthor.authorProfile.metrics,
            collaborationCount: secondCoAuthor.collaborationCount,
          });
        }

        edges.push({
          source: coAuthorId,
          target: secondId,
          weight: secondCoAuthor.collaborationCount,
          sharedPublications: secondCoAuthor.sharedPublicationIds.length,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
};

// Static method: rebuild entire network from publications (admin/maintenance)
coAuthorNetworkSchema.statics.rebuildNetwork = async function () {
  const Publication = mongoose.model('Publication');

  // Clear existing network
  await this.deleteMany({});

  // Get all verified publications with authors
  const publications = await Publication.find({ status: 'oric_verified' })
    .select('_id year authors')
    .lean();

  const operations = [];

  for (const pub of publications) {
    const internalAuthors = pub.authors
      .filter((a) => a.authorId)
      .map((a) => a.authorId.toString());

    // Create pairs
    for (let i = 0; i < internalAuthors.length; i++) {
      for (let j = i + 1; j < internalAuthors.length; j++) {
        const [a1, a2] = [internalAuthors[i], internalAuthors[j]].sort();
        operations.push({
          updateOne: {
            filter: { authorId: a1, coAuthorId: a2 },
            update: {
              $inc: { collaborationCount: 1 },
              $addToSet: { sharedPublicationIds: pub._id },
              $min: { firstCollaborationYear: pub.year },
              $max: { lastCollaborationYear: pub.year },
            },
            upsert: true,
          },
        });
      }
    }
  }

  if (operations.length > 0) {
    await this.bulkWrite(operations, { ordered: false });
  }

  return { processed: operations.length };
};

module.exports = mongoose.model('CoAuthorNetwork', coAuthorNetworkSchema);