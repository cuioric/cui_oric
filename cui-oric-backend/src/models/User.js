/**
 * User Model
 * Core authentication and authorization entity
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("../config/env");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          // Students (MS/PhD) must use the students subdomain; everyone else
          // (faculty, and hod/oric_admin — who are promoted from faculty
          // accounts, never self-registered) uses the main faculty domain.
          const studentRoles = ["ms_student", "phd_student"];
          const domain = studentRoles.includes(this.role)
            ? config.email.studentDomain.toLowerCase()
            : config.email.facultyDomain.toLowerCase();
          return v.toLowerCase().endsWith(`@${domain}`);
        },
        message: `Email must end with @${config.email.facultyDomain} (faculty/HOD/admin) or @${config.email.studentDomain} (MS/PhD students)`,
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Never return password by default
    },
    role: {
      type: String,
      enum: {
        values: ["oric_admin", "hod", "faculty", "ms_student", "phd_student"],
        message: "Invalid role",
      },
      required: [true, "Role is required"],
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null, // null for oric_admin
      validate: {
        validator: function (v) {
          // oric_admin must not have departmentId, others must have it (set at approval)
          if (this.role === "oric_admin") return v === null;
          return true; // Will be validated at approval time
        },
        message: "oric_admin cannot have a departmentId",
      },
    },
    campus: {
      type: String,
      required: [true, "Campus is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: [
          "pending_email_verification",
          "pending_oric_approval",
          "active",
          "rejected",
          "suspended",
          "alumni",
        ],
        message: "Invalid status",
      },
      default: "pending_email_verification",
    },

    // Set when ORIC admin rejects a pending account. Rejection is a
    // reversible decision (status: "rejected"), not a permanent ban —
    // this field just records why, and is cleared again on re-approval.
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, "Rejection reason cannot exceed 500 characters"],
    },

    // Email verification
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },

    // Password reset
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // Refresh token (stored as hash)
    refreshTokenHash: {
      type: String,
      select: false,
    },

    // Failed login tracking
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      select: false,
    },
    lastFailedLogin: {
      type: Date,
      select: false,
    },

    // Last login tracking
    lastLoginAt: {
      type: Date,
      select: false,
    },
    lastLoginIp: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for checking if account is locked
userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware: hash password
userSchema.pre("save", async function (next) {
  // Only hash password if modified
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12); // Cost factor ≥ 12
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Hash the refresh token with SHA-256 before storing.
 * bcrypt is NOT used here — bcrypt truncates input at 72 bytes, and since
 * every refresh token for a given user shares an identical JWT header +
 * payload prefix (same header, same id, same "type":"refresh"), two
 * different tokens for the same user would hash to the SAME bcrypt digest,
 * making rotation/reuse-detection silently useless. SHA-256 hashes the
 * full string with no truncation.
 */
userSchema.pre("save", function (next) {
  if (!this.isModified("refreshTokenHash") || !this.refreshTokenHash)
    return next();
  const crypto = require("crypto");
  this.refreshTokenHash = crypto
    .createHash("sha256")
    .update(this.refreshTokenHash)
    .digest("hex");
  next();
});

// Instance method: compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password comparison failed");
  }
};

// Instance method: compare refresh token
// Instance method: compare refresh token
userSchema.methods.compareRefreshToken = function (candidateToken) {
  if (!this.refreshTokenHash || !candidateToken) return false;
  const crypto = require("crypto");
  const candidateHash = crypto
    .createHash("sha256")
    .update(candidateToken)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(candidateHash, "hex"),
      Buffer.from(this.refreshTokenHash, "hex"),
    );
  } catch (e) {
    return false; // length mismatch or malformed hash — treat as no match
  }
};

// Instance method: increment failed login attempts
userSchema.methods.incrementFailedLogins = async function () {
  this.failedLoginAttempts += 1;
  this.lastFailedLogin = new Date();

  // Progressive lockout: 5 attempts = 15 min, 10 = 1 hour, 15 = 24 hours
  if (this.failedLoginAttempts >= 5) {
    const lockMinutes = Math.min(
      15 * Math.pow(2, Math.floor(this.failedLoginAttempts / 5) - 1),
      1440,
    );
    this.lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
  }

  return this.save({ validateBeforeSave: false });
};

// Instance method: reset failed login attempts
userSchema.methods.resetFailedLogins = async function () {
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
  this.lastFailedLogin = null;
  return this.save({ validateBeforeSave: false });
};

// Static method: generate email verification token
userSchema.statics.generateEmailVerificationToken = function () {
  const crypto = require("crypto");
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
};

// Static method: generate password reset token
userSchema.statics.generatePasswordResetToken = function () {
  const crypto = require("crypto");
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
};

// Static method: generate refresh token
userSchema.statics.generateRefreshToken = function () {
  const crypto = require("crypto");
  return crypto.randomBytes(64).toString("hex");
};

module.exports = mongoose.model("User", userSchema);