/**
 * Authentication Integration Tests
 * Tests registration, verification, login, RBAC, and password reset flows
 */

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { app } = require("../src/app");
const User = require("../src/models/User");
const Department = require("../src/models/Department");
const AuthorProfile = require("../src/models/AuthorProfile");

beforeEach(async () => {
  await User.deleteMany({});
  await Department.deleteMany({});
  await AuthorProfile.deleteMany({});
});

describe("Authentication Flow", () => {
  describe("POST /api/v1/auth/register", () => {
    it("should register a new faculty user", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        name: "Dr. Test Faculty",
        email: "test.faculty@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBeDefined();
      expect(res.body.data.email).toBe("test.faculty@cui.edu.pk");

      // Verify user in database
      const user = await User.findOne({ email: "test.faculty@cui.edu.pk" });
      expect(user).toBeTruthy();
      expect(user.status).toBe("pending_email_verification");
      expect(user.role).toBe("faculty");
    });

    it("should register a new MS student", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        name: "Test MS Student",
        email: "test.ms@cui.edu.pk",
        password: "Password@123",
        role: "ms_student",
        campus: "Sahiwal",
      });

      expect(res.status).toBe(201);
      const user = await User.findOne({ email: "test.ms@cui.edu.pk" });
      expect(user.role).toBe("ms_student");
    });

    it("should register a new PhD student", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        name: "Test PhD Student",
        email: "test.phd@cui.edu.pk",
        password: "Password@123",
        role: "phd_student",
        campus: "Sahiwal",
      });

      expect(res.status).toBe(201);
      const user = await User.findOne({ email: "test.phd@cui.edu.pk" });
      expect(user.role).toBe("phd_student");
    });

    it("should reject registration with non-CUI email", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        name: "External User",
        email: "external@gmail.com",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("should reject registration with invalid role", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        name: "Test User",
        email: "test@cui.edu.pk",
        password: "Password@123",
        role: "oric_admin", // Not allowed for registration
        campus: "Sahiwal",
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("should reject duplicate email", async () => {
      await request(app).post("/api/v1/auth/register").send({
        name: "Test User",
        email: "duplicate@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
      });

      const res = await request(app).post("/api/v1/auth/register").send({
        name: "Test User 2",
        email: "duplicate@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CONFLICT");
    });

    it("should reject weak password", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        name: "Test User",
        email: "weak@cui.edu.pk",
        password: "weak",
        role: "faculty",
        campus: "Sahiwal",
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/auth/verify-email/:token", () => {
    it("should verify email and move status to pending_oric_approval", async () => {
      // Create user with verification token
      const user = await User.create({
        name: "Test User",
        email: "verify@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "pending_email_verification",
      });

      const { token } = User.generateEmailVerificationToken();
      user.emailVerificationToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      user.emailVerificationExpires = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      );
      await user.save();

      const res = await request(app).get(`/api/v1/auth/verify-email/${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.status).toBe("pending_oric_approval");
      expect(updatedUser.emailVerificationToken).toBeUndefined();
    });

    // tests/auth.test.js
    it("should reject invalid token", async () => {
      const res = await request(app).get(
        "/api/v1/auth/verify-email/a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4",
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BAD_REQUEST");
    });

    it("should reject expired token", async () => {
      const user = await User.create({
        name: "Test User",
        email: "expired@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "pending_email_verification",
      });

      const { token } = User.generateEmailVerificationToken();
      user.emailVerificationToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      user.emailVerificationExpires = new Date(Date.now() - 1000); // Expired
      await user.save();

      const res = await request(app).get(`/api/v1/auth/verify-email/${token}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BAD_REQUEST");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      // Create active user
      await User.create({
        name: "Active User",
        email: "active@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "active",
      });
    });

    it("should login active user and return tokens", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: "active@cui.edu.pk",
        password: "Password@123",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.role).toBe("faculty");

      // Check refresh token cookie
      expect(res.headers["set-cookie"]).toBeDefined();
      const cookie = res.headers["set-cookie"].find((c) =>
        c.startsWith("refreshToken="),
      );
      expect(cookie).toBeDefined();
      expect(cookie).toContain("HttpOnly");
    });

    it("should reject wrong password with generic message", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: "active@cui.edu.pk",
        password: "WrongPassword@123",
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain(
        "Invalid credentials or account not active",
      );
    });

    it("should reject non-existent user with generic message", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: "nonexistent@cui.edu.pk",
        password: "Password@123",
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain(
        "Invalid credentials or account not active",
      );
    });

    it("should reject pending_email_verification user", async () => {
      await User.create({
        name: "Pending User",
        email: "pending@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "pending_email_verification",
      });

      const res = await request(app).post("/api/v1/auth/login").send({
        email: "pending@cui.edu.pk",
        password: "Password@123",
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain(
        "Invalid credentials or account not active",
      );
    });

    it("should reject pending_oric_approval user", async () => {
      await User.create({
        name: "Pending Approval User",
        email: "pendingapproval@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "pending_oric_approval",
      });

      const res = await request(app).post("/api/v1/auth/login").send({
        email: "pendingapproval@cui.edu.pk",
        password: "Password@123",
      });

      expect(res.status).toBe(401);
    });

    it("should reject suspended user", async () => {
      await User.create({
        name: "Suspended User",
        email: "suspended@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "suspended",
      });

      const res = await request(app).post("/api/v1/auth/login").send({
        email: "suspended@cui.edu.pk",
        password: "Password@123",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("should refresh access token with valid refresh token", async () => {
      const user = await User.create({
        name: "Refresh User",
        email: "refresh@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "active",
      });

      const config = require("../src/config/env");
      const refreshToken = jwt.sign(
        { id: user._id, type: "refresh" },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpires },
      );

      // Store hash
      const bcrypt = require("bcryptjs");
      user.refreshTokenHash = refreshToken;
      await user.save();

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refreshToken=${refreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();

      // New refresh token should be set
      const newCookie = res.headers["set-cookie"].find((c) =>
        c.startsWith("refreshToken="),
      );
      expect(newCookie).toBeDefined();
    });

    it("should reject expired refresh token", async () => {
      const config = require("../src/config/env");
      const expiredToken = jwt.sign(
        { id: new mongoose.Types.ObjectId(), type: "refresh" },
        config.jwt.refreshSecret,
        { expiresIn: "-1h" },
      );

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refreshToken=${expiredToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("REFRESH_TOKEN_EXPIRED");
    });

    it("should reject invalid refresh token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", ["refreshToken=invalidtoken"]);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("should reject reused refresh token (rotation)", async () => {
      const user = await User.create({
        name: "Rotation User",
        email: "rotation@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "active",
      });

      const config = require("../src/config/env");
      const refreshToken = jwt.sign(
        { id: user._id, type: "refresh" },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpires },
      );

      const bcrypt = require("bcryptjs");
      user.refreshTokenHash = refreshToken;
      await user.save();

      // First refresh - should work
      await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refreshToken=${refreshToken}`]);

      // Second refresh with same token - should fail
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refreshToken=${refreshToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("REFRESH_TOKEN_REVOKED");
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should clear refresh token cookie", async () => {
      const res = await request(app).post("/api/v1/auth/logout");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const cookie = res.headers["set-cookie"].find((c) =>
        c.startsWith("refreshToken="),
      );
      expect(cookie).toContain("Max-Age=0");
    });
  });

  describe("Password Reset Flow", () => {
    it("should send reset email for active user", async () => {
      await User.create({
        name: "Reset User",
        email: "reset@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "active",
      });

      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "reset@cui.edu.pk" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const user = await User.findOne({ email: "reset@cui.edu.pk" }).select(
        "+passwordResetToken +passwordResetExpires",
      );
      expect(user.passwordResetToken).toBeDefined();
      expect(user.passwordResetExpires).toBeDefined();
    });

    it("should return success even for non-existent email (prevent enumeration)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "nonexistent@cui.edu.pk" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should reset password with valid token", async () => {
      const user = await User.create({
        name: "Reset User",
        email: "reset2@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "active",
      });

      const { token } = User.generatePasswordResetToken();
      user.passwordResetToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const res = await request(app).post("/api/v1/auth/reset-password").send({
        token,
        password: "NewPassword@123",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify new password works
      const loginRes = await request(app).post("/api/v1/auth/login").send({
        email: "reset2@cui.edu.pk",
        password: "NewPassword@123",
      });

      expect(loginRes.status).toBe(200);
    });

    it("should reject expired reset token", async () => {
      const user = await User.create({
        name: "Reset User",
        email: "reset3@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "active",
      });

      const { token } = User.generatePasswordResetToken();
      user.passwordResetToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      user.passwordResetExpires = new Date(Date.now() - 1000);
      await user.save();

      const res = await request(app).post("/api/v1/auth/reset-password").send({
        token,
        password: "NewPassword@123",
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BAD_REQUEST");
    });
  });
});

describe("Rate Limiting", () => {
  it("should rate limit auth endpoints", async () => {
    // Make 6 requests (limit is 5)
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: `ratelimit${i}@cui.edu.pk`,
          password: "Password@123",
        });
    }

    // 6th request should be rate limited
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "ratelimit10@cui.edu.pk",
      password: "Password@123",
    });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});

describe("Failed Login Lockout", () => {
  it("should lock account after 5 failed attempts", async () => {
    await User.create({
      name: "Lockout User",
      email: "lockout@cui.edu.pk",
      password: "Password@123",
      role: "faculty",
      campus: "Sahiwal",
      status: "active",
    });

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: "lockout@cui.edu.pk",
        password: "WrongPassword@123",
      });
    }

    // 6th attempt should be locked
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "lockout@cui.edu.pk",
      password: "WrongPassword@123",
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("locked");
  });
});
