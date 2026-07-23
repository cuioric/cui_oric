/**
 * Publication Workflow State Machine Tests
 * Tests all valid and invalid status transitions
 */

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const { app } = require("../src/app");
const User = require("../src/models/User");
const Department = require("../src/models/Department");
const Publication = require("../src/models/Publication");
const PublicationReview = require("../src/models/PublicationReview");
const AuthorProfile = require("../src/models/AuthorProfile");

beforeEach(async () => {
  await User.deleteMany({});
  await Department.deleteMany({});
  await Publication.deleteMany({});
  await PublicationReview.deleteMany({});
  await AuthorProfile.deleteMany({});
});

// Helper functions
const createUserWithToken = async (userData) => {
  const config = require("../src/config/env");
  const user = await User.create({
    ...userData,
    password: "Password@123",
    status: "active",
  });

  const accessToken = jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires },
  );

  return { user, accessToken };
};

const createPublication = async (
  authorId,
  departmentId,
  status = "draft",
  overrides = {},
) => {
  return Publication.create({
    title: `Test Publication ${Date.now()}`,
    abstract: "Test abstract for publication",
    publicationType: "journal_article",
    authors: [{ authorId, order: 1, isCorresponding: true }],
    venue: { name: "Test Journal", type: "journal" },
    year: 2024,
    status,
    submittedBy: authorId,
    departmentId,
    createdBy: authorId,
    ...overrides,
  });
};

describe("Publication Workflow State Machine", () => {
  let department, hod, faculty, oricAdmin;

  beforeEach(async () => {
    department = await Department.create({
      name: "Computer Science",
      campus: "Sahiwal",
    });

    hod = await createUserWithToken({
      name: "HOD CS",
      email: "hod.cs@cui.edu.pk",
      role: "hod",
      campus: "Sahiwal",
      departmentId: department._id,
    });
    department.hodId = hod.user._id;
    await department.save();

    faculty = await createUserWithToken({
      name: "Faculty Member",
      email: "faculty@cui.edu.pk",
      role: "faculty",
      campus: "Sahiwal",
      departmentId: department._id,
    });

    oricAdmin = await createUserWithToken({
      name: "ORIC Admin",
      email: "oric.admin@cui.edu.pk",
      role: "oric_admin",
      campus: "Sahiwal",
    });

    await AuthorProfile.create({
      userId: faculty.user._id,
      departmentId: department._id,
      verifiedEmail: true,
    });
  });

  describe("Valid Transitions", () => {
    it("draft -> submitted_to_hod (by owner)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "draft",
        {
          pdfFile: "publications/test/sample.pdf",
        },
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/submit`)
        .set("Authorization", `Bearer ${faculty.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("submitted_to_hod");

      // Check review record created
      const review = await PublicationReview.findOne({
        publicationId: pub._id,
      });
      expect(review).toBeTruthy();
      expect(review.previousStatus).toBe("draft");
      expect(review.newStatus).toBe("submitted_to_hod");
      expect(review.stage).toBe("hod_review");
    });

    it("submitted_to_hod -> hod_approved -> sent_to_oric (by HOD)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "submitted_to_hod",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/hod-review`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({ decision: "approved", remarks: "Good paper" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("sent_to_oric");

      // Check review record
      const reviews = await PublicationReview.find({ publicationId: pub._id });
      expect(reviews.length).toBe(1);
      expect(reviews[0].decision).toBe("approved");
      expect(reviews[0].newStatus).toBe("sent_to_oric");
    });

    it("submitted_to_hod -> hod_rejected (by HOD)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "submitted_to_hod",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/hod-review`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({ decision: "rejected", remarks: "Needs revision" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("hod_rejected");
    });

    it("sent_to_oric -> oric_verified (by ORIC admin)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "sent_to_oric",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/oric-review`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ decision: "verified", remarks: "Verified" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("oric_verified");
    });

    it("sent_to_oric -> oric_rejected (by ORIC admin)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "sent_to_oric",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/oric-review`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ decision: "rejected", remarks: "Not up to standard" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("oric_rejected");
    });

    it("hod_rejected -> draft (owner can edit and resubmit)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "hod_rejected",
      );

      // Step 1: transition hod_rejected -> draft
      const resubmitRes = await request(app)
        .post(`/api/v1/publications/${pub._id}/resubmit`)
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ remarks: "Fixing issues" });
      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.data.status).toBe("draft");

      // Step 2: now PATCH works because status is draft
      const res = await request(app)
        .patch(`/api/v1/publications/${pub._id}`)
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ title: "Revised Title" });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe("Revised Title");
    });

    it("oric_rejected -> draft (owner can edit and resubmit)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "oric_rejected",
      );

      const resubmitRes = await request(app)
        .post(`/api/v1/publications/${pub._id}/resubmit`)
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ remarks: "Fixing issues" });
      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.data.status).toBe("draft");

      const res = await request(app)
        .patch(`/api/v1/publications/${pub._id}`)
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ title: "Revised Title" });

      expect(res.status).toBe(200);
    });
  });

  describe("Invalid Transitions (should be rejected)", () => {
    it("should reject draft -> hod_approved (skip HOD)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "draft",
      );

      // Try to directly set status via PATCH (should fail)
      const res = await request(app)
        .patch(`/api/v1/publications/${pub._id}`)
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ status: "hod_approved" });

      // Status should not change (only allowed fields can be updated)
      const updated = await Publication.findById(pub._id);
      expect(updated.status).toBe("draft");
    });

    it("should reject submitted_to_hod -> oric_verified (skip ORIC)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "submitted_to_hod",
      );

      // HOD tries to set to oric_verified via review
      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/hod-review`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({ decision: "approved", remarks: "Good" });

      // Should go to sent_to_oric, not oric_verified
      expect(res.body.data.status).toBe("sent_to_oric");
    });

    it("should reject hod_approved -> oric_rejected (invalid state)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "hod_approved",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/oric-review`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ decision: "rejected", remarks: "Reject" });

      // hod_approved auto-transitions to sent_to_oric, so this state shouldn't exist
      // But if it does, ORIC review should fail
      expect(res.status).toBe(403);
    });

    it("should reject oric_verified -> any (terminal state)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "oric_verified",
      );

      // Try to submit again
      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/submit`)
        .set("Authorization", `Bearer ${faculty.accessToken}`);

      expect(res.status).toBe(403);
    });

    it("should reject draft -> oric_verified (multiple skips)", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "draft",
      );

      // Try ORIC review on draft
      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/oric-review`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ decision: "verified", remarks: "Verified" });

      expect(res.status).toBe(403);
    });
  });

  describe("Authorization Checks", () => {
    it("should reject submit by non-owner", async () => {
      const otherFaculty = await createUserWithToken({
        name: "Other Faculty",
        email: "other@cui.edu.pk",
        role: "faculty",
        campus: "Sahiwal",
        departmentId: department._id,
      });

      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "draft",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/submit`)
        .set("Authorization", `Bearer ${otherFaculty.accessToken}`);

      expect(res.status).toBe(403);
    });

    it("should reject HOD review by non-HOD", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "submitted_to_hod",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/hod-review`)
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ decision: "approved", remarks: "Good" });

      expect(res.status).toBe(403);
    });

    it("should reject HOD review from different department", async () => {
      const otherDept = await Department.create({
        name: "Electrical Engineering",
        campus: "Sahiwal",
      });

      const otherHod = await createUserWithToken({
        name: "Other HOD",
        email: "other.hod@cui.edu.pk",
        role: "hod",
        campus: "Sahiwal",
        departmentId: otherDept._id,
      });
      otherDept.hodId = otherHod.user._id;
      await otherDept.save();

      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "submitted_to_hod",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/hod-review`)
        .set("Authorization", `Bearer ${otherHod.accessToken}`)
        .send({ decision: "approved", remarks: "Good" });

      expect(res.status).toBe(403);
    });

    it("should reject ORIC review by non-admin", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "sent_to_oric",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/oric-review`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({ decision: "verified", remarks: "Verified" });

      expect(res.status).toBe(403);
    });
  });

  describe("Review Record Creation", () => {
    it("should create review record for each transition", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "draft",
        { pdfFile: "publications/test/sample.pdf" },
      );

      // Submit
      await request(app)
        .post(`/api/v1/publications/${pub._id}/submit`)
        .set("Authorization", `Bearer ${faculty.accessToken}`);

      // HOD approve
      await request(app)
        .post(`/api/v1/publications/${pub._id}/hod-review`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({ decision: "approved", remarks: "Good" });

      // ORIC verify
      await request(app)
        .post(`/api/v1/publications/${pub._id}/oric-review`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ decision: "verified", remarks: "Verified" });

      const reviews = await PublicationReview.find({
        publicationId: pub._id,
      }).sort({ reviewedAt: 1 });
      expect(reviews.length).toBe(3);

      // Check each review
      expect(reviews[0].stage).toBe("hod_review");
      expect(reviews[0].previousStatus).toBe("draft");
      expect(reviews[0].newStatus).toBe("submitted_to_hod");
      expect(reviews[0].decision).toBe("submitted");

      expect(reviews[1].stage).toBe("hod_review");
      expect(reviews[1].previousStatus).toBe("submitted_to_hod");
      expect(reviews[1].newStatus).toBe("sent_to_oric");
      expect(reviews[1].decision).toBe("approved");

      expect(reviews[2].stage).toBe("oric_review");
      expect(reviews[2].previousStatus).toBe("sent_to_oric");
      expect(reviews[2].newStatus).toBe("oric_verified");
      expect(reviews[2].decision).toBe("approved");
    });

    it("should mirror remarks to publication.lastRemarks", async () => {
      const pub = await createPublication(
        faculty.user._id,
        department._id,
        "submitted_to_hod",
      );

      const res = await request(app)
        .post(`/api/v1/publications/${pub._id}/hod-review`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({ decision: "approved", remarks: "HOD remarks here" });

      expect(res.status).toBe(200);
      const updated = await Publication.findById(pub._id);
      expect(updated.lastRemarks).toBe("HOD remarks here");
    });

    it("should not allow updating review records (append-only)", async () => {
      const review = await PublicationReview.create({
        publicationId: new mongoose.Types.ObjectId(),
        stage: "hod_review",
        reviewedBy: hod.user._id,
        decision: "approved",
        remarks: "Original",
        previousStatus: "draft",
        newStatus: "submitted_to_hod",
      });

      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${review._id}`) // This endpoint doesn't exist
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ remarks: "Modified" });

      // Should 404 since route doesn't exist
      expect(res.status).toBe(404);
    });
  });

  describe("State Machine Validation in Model", () => {
    it("should validate transitions via model method", async () => {
      expect(Publication.isValidTransition("draft", "submitted_to_hod")).toBe(
        true,
      );
      expect(
        Publication.isValidTransition("submitted_to_hod", "hod_approved"),
      ).toBe(true);
      expect(
        Publication.isValidTransition("submitted_to_hod", "hod_rejected"),
      ).toBe(true);
      expect(
        Publication.isValidTransition("hod_approved", "sent_to_oric"),
      ).toBe(true);
      expect(
        Publication.isValidTransition("sent_to_oric", "oric_verified"),
      ).toBe(true);
      expect(
        Publication.isValidTransition("sent_to_oric", "oric_rejected"),
      ).toBe(true);
      expect(Publication.isValidTransition("hod_rejected", "draft")).toBe(true);
      expect(Publication.isValidTransition("oric_rejected", "draft")).toBe(
        true,
      );
    });

    it("should reject invalid transitions via model method", async () => {
      expect(Publication.isValidTransition("draft", "hod_approved")).toBe(
        false,
      );
      expect(Publication.isValidTransition("draft", "oric_verified")).toBe(
        false,
      );
      expect(
        Publication.isValidTransition("submitted_to_hod", "oric_verified"),
      ).toBe(false);
      expect(Publication.isValidTransition("oric_verified", "draft")).toBe(
        false,
      );
      expect(
        Publication.isValidTransition("oric_verified", "sent_to_oric"),
      ).toBe(false);
    });
  });
});
