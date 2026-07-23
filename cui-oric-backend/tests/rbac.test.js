/**
 * RBAC Integration Tests
 * Tests role-based access control on all protected routes
 */

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const { app } = require("../src/app");
const User = require("../src/models/User");
const Department = require("../src/models/Department");
const AuthorProfile = require("../src/models/AuthorProfile");
const Publication = require("../src/models/Publication");

beforeEach(async () => {
  await User.deleteMany({});
  await Department.deleteMany({});
  await AuthorProfile.deleteMany({});
  await Publication.deleteMany({});
});

// Helper to create users with tokens
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

describe("RBAC - Role Permissions", () => {
  let oricAdmin, hod, faculty, msStudent, phdStudent, department;

  beforeEach(async () => {
    // Create department
    department = await Department.create({
      name: "Computer Science",
      campus: "Sahiwal",
    });

    // Create users
    oricAdmin = await createUserWithToken({
      name: "ORIC Admin",
      email: "oric.admin@cui.edu.pk",
      role: "oric_admin",
      campus: "Sahiwal",
      departmentId: null,
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

    msStudent = await createUserWithToken({
      name: "MS Student",
      email: "ms.student@cui.edu.pk",
      role: "ms_student",
      campus: "Sahiwal",
      departmentId: department._id,
    });

    phdStudent = await createUserWithToken({
      name: "PhD Student",
      email: "phd.student@cui.edu.pk",
      role: "phd_student",
      campus: "Sahiwal",
      departmentId: department._id,
    });

    // Create author profiles
    for (const u of [oricAdmin, hod, faculty, msStudent, phdStudent]) {
      await AuthorProfile.create({
        userId: u.user._id,
        departmentId: u.user.departmentId || department._id,
        verifiedEmail: true,
      });
    }
  });

  describe("Admin Routes (ORIC Admin only)", () => {
    it("should allow ORIC admin to list pending users", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users/pending")
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`);

      expect(res.status).toBe(200);
    });

    it("should deny HOD access to admin user routes", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users/pending")
        .set("Authorization", `Bearer ${hod.accessToken}`);

      expect(res.status).toBe(403);
    });

    it("should deny faculty access to admin user routes", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users/pending")
        .set("Authorization", `Bearer ${faculty.accessToken}`);

      expect(res.status).toBe(403);
    });

    it("should allow ORIC admin to approve user", async () => {
      const pendingUser = await User.create({
        name: "Pending User",
        email: "pending@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "pending_oric_approval",
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${pendingUser._id}/approve`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({
          departmentId: department._id,
          role: "faculty",
        });

      expect(res.status).toBe(200);
    });

    it("should deny HOD to approve user", async () => {
      const pendingUser = await User.create({
        name: "Pending User",
        email: "pending2@cui.edu.pk",
        password: "Password@123",
        role: "faculty",
        campus: "Sahiwal",
        status: "pending_oric_approval",
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${pendingUser._id}/approve`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({
          departmentId: department._id,
          role: "faculty",
        });

      expect(res.status).toBe(403);
    });
  });

  describe("Department Routes", () => {
    it("should allow ORIC admin to create department", async () => {
      const res = await request(app)
        .post("/api/v1/admin/departments")
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({
          name: "New Department",
          campus: "Sahiwal",
        });

      expect(res.status).toBe(201);
    });

    it("should deny HOD to create department", async () => {
      const res = await request(app)
        .post("/api/v1/admin/departments")
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({
          name: "New Department",
          campus: "Sahiwal",
        });

      expect(res.status).toBe(403);
    });

    it("should allow public to list departments", async () => {
      const res = await request(app).get("/api/v1/departments");

      expect(res.status).toBe(200);
    });
  });

  describe("Publication Routes - Author Permissions", () => {
    it("should allow faculty to create publication", async () => {
      const res = await request(app)
        .post("/api/v1/publications")
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({
          title: "Test Publication",
          abstract: "Test abstract",
          publicationType: "journal_article",
          authors: [
            { authorId: faculty.user._id, order: 1, isCorresponding: true },
          ],
          venue: { name: "Test Journal", type: "journal" },
          year: 2024,
        });

      expect(res.status).toBe(201);
    });

    it("should allow MS student to create publication", async () => {
      const res = await request(app)
        .post("/api/v1/publications")
        .set("Authorization", `Bearer ${msStudent.accessToken}`)
        .send({
          title: "MS Student Publication",
          abstract: "Test abstract",
          publicationType: "conference_paper",
          authors: [
            { authorId: msStudent.user._id, order: 1, isCorresponding: true },
          ],
          venue: { name: "Test Conference", type: "conference" },
          year: 2024,
        });

      expect(res.status).toBe(201);
    });

    it("should allow PhD student to create publication", async () => {
      const res = await request(app)
        .post("/api/v1/publications")
        .set("Authorization", `Bearer ${phdStudent.accessToken}`)
        .send({
          title: "PhD Student Publication",
          abstract: "Test abstract",
          publicationType: "journal_article",
          authors: [
            { authorId: phdStudent.user._id, order: 1, isCorresponding: true },
          ],
          venue: { name: "Test Journal", type: "journal" },
          year: 2024,
        });

      expect(res.status).toBe(201);
    });

    it("should deny HOD to create publication (not an author role)", async () => {
      const res = await request(app)
        .post("/api/v1/publications")
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({
          title: "HOD Publication",
          abstract: "Test abstract",
          publicationType: "journal_article",
          authors: [
            { authorId: hod.user._id, order: 1, isCorresponding: true },
          ],
          venue: { name: "Test Journal", type: "journal" },
          year: 2024,
        });

      expect(res.status).toBe(403);
    });

    it("should deny ORIC admin to create publication", async () => {
      const res = await request(app)
        .post("/api/v1/publications")
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({
          title: "Admin Publication",
          abstract: "Test abstract",
          publicationType: "journal_article",
          authors: [
            { authorId: oricAdmin.user._id, order: 1, isCorresponding: true },
          ],
          venue: { name: "Test Journal", type: "journal" },
          year: 2024,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("Publication Routes - Ownership", () => {
    let publication;

    beforeEach(async () => {
      publication = await Publication.create({
        title: "Owned Publication",
        abstract: "Test abstract",
        publicationType: "journal_article",
        authors: [
          { authorId: faculty.user._id, order: 1, isCorresponding: true },
        ],
        venue: { name: "Test Journal", type: "journal" },
        year: 2024,
        status: "draft",
        submittedBy: faculty.user._id,
        departmentId: department._id,
        createdBy: faculty.user._id,
        pdfFile: "publications/test/sample.pdf",
      });
    });

    it("should allow owner to update draft", async () => {
      const res = await request(app)
        .patch(`/api/v1/publications/${publication._id}`)
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ title: "Updated Title" });

      expect(res.status).toBe(200);
    });

    it("should deny other faculty to update draft", async () => {
      const otherFaculty = await createUserWithToken({
        name: "Other Faculty",
        email: "other@cui.edu.pk",
        role: "faculty",
        campus: "Sahiwal",
        departmentId: department._id,
      });

      const res = await request(app)
        .patch(`/api/v1/publications/${publication._id}`)
        .set("Authorization", `Bearer ${otherFaculty.accessToken}`)
        .send({ title: "Updated Title" });

      expect(res.status).toBe(403);
    });

    it("should allow ORIC admin to update any publication", async () => {
      const res = await request(app)
        .patch(`/api/v1/publications/${publication._id}`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ title: "Admin Updated" });

      expect(res.status).toBe(200);
    });

    it("should allow owner to submit draft", async () => {
      const res = await request(app)
        .post(`/api/v1/publications/${publication._id}/submit`)
        .set("Authorization", `Bearer ${faculty.accessToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe("Publication Routes - HOD Department Scoping", () => {
    let otherDepartment, otherHod, otherFaculty, submission;

    beforeEach(async () => {
      // Create another department
      otherDepartment = await Department.create({
        name: "Electrical Engineering",
        campus: "Sahiwal",
      });

      otherHod = await createUserWithToken({
        name: "HOD EE",
        email: "hod.ee@cui.edu.pk",
        role: "hod",
        campus: "Sahiwal",
        departmentId: otherDepartment._id,
      });
      otherDepartment.hodId = otherHod.user._id;
      await otherDepartment.save();

      otherFaculty = await createUserWithToken({
        name: "EE Faculty",
        email: "ee.faculty@cui.edu.pk",
        role: "faculty",
        campus: "Sahiwal",
        departmentId: otherDepartment._id,
      });

      // Create submission from other department
      submission = await Publication.create({
        title: "Other Dept Submission",
        abstract: "Test abstract",
        publicationType: "journal_article",
        authors: [
          { authorId: otherFaculty.user._id, order: 1, isCorresponding: true },
        ],
        venue: { name: "Test Journal", type: "journal" },
        year: 2024,
        status: "submitted_to_hod",
        submittedBy: otherFaculty.user._id,
        departmentId: otherDepartment._id,
        createdBy: otherFaculty.user._id,
      });
    });

    it("should allow HOD to review submissions from own department", async () => {
      const res = await request(app)
        .post(`/api/v1/publications/${submission._id}/hod-review`)
        .set("Authorization", `Bearer ${otherHod.accessToken}`)
        .send({ decision: "approved", remarks: "Good paper" });

      expect(res.status).toBe(200);
    });

    it("should deny HOD from reviewing other department submissions", async () => {
      const res = await request(app)
        .post(`/api/v1/publications/${submission._id}/hod-review`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({ decision: "approved", remarks: "Good paper" });

      expect(res.status).toBe(403);
    });

    it("should allow ORIC admin to review any submission", async () => {
      const res = await request(app)
        .post(`/api/v1/publications/${submission._id}/hod-review`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ decision: "approved", remarks: "Good paper" });

      expect(res.status).toBe(200);
    });
  });

  describe("Publication Routes - ORIC Review", () => {
    let oricSubmission;

    beforeEach(async () => {
      oricSubmission = await Publication.create({
        title: "ORIC Submission",
        abstract: "Test abstract",
        publicationType: "journal_article",
        authors: [
          { authorId: faculty.user._id, order: 1, isCorresponding: true },
        ],
        venue: { name: "Test Journal", type: "journal" },
        year: 2024,
        status: "sent_to_oric",
        submittedBy: faculty.user._id,
        departmentId: department._id,
        createdBy: faculty.user._id,
      });
    });

    it("should allow ORIC admin to verify", async () => {
      const res = await request(app)
        .post(`/api/v1/publications/${oricSubmission._id}/oric-review`)
        .set("Authorization", `Bearer ${oricAdmin.accessToken}`)
        .send({ decision: "verified", remarks: "Verified" });

      expect(res.status).toBe(200);
    });

    it("should deny HOD to perform ORIC review", async () => {
      const res = await request(app)
        .post(`/api/v1/publications/${oricSubmission._id}/oric-review`)
        .set("Authorization", `Bearer ${hod.accessToken}`)
        .send({ decision: "verified", remarks: "Verified" });

      expect(res.status).toBe(403);
    });

    it("should deny faculty to perform ORIC review", async () => {
      const res = await request(app)
        .post(`/api/v1/publications/${oricSubmission._id}/oric-review`)
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ decision: "verified", remarks: "Verified" });

      expect(res.status).toBe(403);
    });
  });

  describe("Publication Visibility", () => {
    let verifiedPub, draftPub, submittedPub;

    beforeEach(async () => {
      verifiedPub = await Publication.create({
        title: "Verified Publication",
        abstract: "Test abstract",
        publicationType: "journal_article",
        authors: [
          { authorId: faculty.user._id, order: 1, isCorresponding: true },
        ],
        venue: { name: "Test Journal", type: "journal" },
        year: 2024,
        status: "oric_verified",
        submittedBy: faculty.user._id,
        departmentId: department._id,
        createdBy: faculty.user._id,
      });

      draftPub = await Publication.create({
        title: "Draft Publication",
        abstract: "Test abstract",
        publicationType: "journal_article",
        authors: [
          { authorId: faculty.user._id, order: 1, isCorresponding: true },
        ],
        venue: { name: "Test Journal", type: "journal" },
        year: 2024,
        status: "draft",
        submittedBy: faculty.user._id,
        departmentId: department._id,
        createdBy: faculty.user._id,
      });

      submittedPub = await Publication.create({
        title: "Submitted Publication",
        abstract: "Test abstract",
        publicationType: "journal_article",
        authors: [
          { authorId: faculty.user._id, order: 1, isCorresponding: true },
        ],
        venue: { name: "Test Journal", type: "journal" },
        year: 2024,
        status: "submitted_to_hod",
        submittedBy: faculty.user._id,
        departmentId: department._id,
        createdBy: faculty.user._id,
      });
    });

    it("should allow unauthenticated users to see verified publications", async () => {
      const res = await request(app).get("/api/v1/publications");

      expect(res.status).toBe(200);
      const pubs = res.body.data.map((p) => p.title);
      expect(pubs).toContain("Verified Publication");
      expect(pubs).not.toContain("Draft Publication");
      expect(pubs).not.toContain("Submitted Publication");
    });

    it("should allow faculty to see own drafts and submissions", async () => {
      const res = await request(app)
        .get("/api/v1/publications")
        .set("Authorization", `Bearer ${faculty.accessToken}`);

      expect(res.status).toBe(200);
      const pubs = res.body.data.map((p) => p.title);
      expect(pubs).toContain("Verified Publication");
      expect(pubs).toContain("Draft Publication");
      expect(pubs).toContain("Submitted Publication");
    });

    it("should allow HOD to see department publications", async () => {
      const res = await request(app)
        .get("/api/v1/publications")
        .set("Authorization", `Bearer ${hod.accessToken}`);

      expect(res.status).toBe(200);
      const pubs = res.body.data.map((p) => p.title);
      expect(pubs).toContain("Verified Publication");
      expect(pubs).toContain("Draft Publication");
      expect(pubs).toContain("Submitted Publication");
    });
  });

  describe("Author Profile Access", () => {
    it("should allow users to update own profile", async () => {
      const res = await request(app)
        .patch("/api/v1/author-profile/me")
        .set("Authorization", `Bearer ${faculty.accessToken}`)
        .send({ designation: "Updated Designation" });

      expect(res.status).toBe(200);
    });

    it("should allow public to view active author profiles", async () => {
      const profile = await AuthorProfile.findOne({ userId: faculty.user._id });
      const res = await request(app).get(
        `/api/v1/author-profile/${profile._id}`,
      );
      expect(res.status).toBe(200);
    });
  });
});
