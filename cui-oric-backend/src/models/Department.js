/**
 * Department Model
 * Academic department entity with HOD reference
 */

const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      maxlength: [100, 'Department name cannot exceed 100 characters'],
    },
    campus: {
      type: String,
      required: [true, 'Campus is required'],
      trim: true,
      enum: {
        values: ['Sahiwal', 'Islamabad', 'Lahore', 'Wah', 'Attock', 'Vehari', 'Virtual'],
        message: 'Invalid campus',
      },
    },
    hodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      validate: {
        validator: async function (v) {
          if (!v) return true;
          const User = mongoose.model('User');
          const user = await User.findById(v);
          return user && user.role === 'hod';
        },
        message: 'HOD must be a user with role "hod"',
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index
departmentSchema.index({ hodId: 1 }, { name: 'idx_dept_hod' });

// Virtual for getting HOD details
departmentSchema.virtual('hod', {
  ref: 'User',
  localField: 'hodId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for getting faculty count
departmentSchema.virtual('facultyCount', {
  ref: 'User',
  localField: '_id',
  foreignField: 'departmentId',
  count: true,
  match: { role: { $in: ['faculty', 'ms_student', 'phd_student'] }, status: 'active' },
});

// Static method: get departments with HOD populated
departmentSchema.statics.getWithHod = function () {
  return this.find().populate('hodId', 'name email');
};

module.exports = mongoose.model('Department', departmentSchema);