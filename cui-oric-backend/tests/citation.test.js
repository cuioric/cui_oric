/**
 * Citation Integration Tests
 * Tests citation management and citation count updates
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { app } = require('../src/app');
const User = require('../src/models/User');
const Department = require('../src/models/Department');
const Publication = require('../src/models/Publication');
const Citation = require('../src/models/Citation');
const AuthorProfile = require('../src/models/AuthorProfile');

beforeEach(async () => {
  await User.deleteMany({});
  await Department.deleteMany({});
  await Publication.deleteMany({});
  await Citation.deleteMany({});
  await AuthorProfile.deleteMany({});
});

const createUserWithToken = async (userData) => {
  const config = require('../src/config/env');
  const user = await User.create({
    ...userData,
    password: 'Password@123',
    status: 'active',
  });

  const accessToken = jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires }
  );

  return { user, accessToken };
};

describe('Citation Management', () => {
  let department, faculty, oricAdmin, pub1, pub2, pub3;

  beforeEach(async () => {
    department = await Department.create({
      name: 'Computer Science',
      campus: 'Sahiwal',
    });

    faculty = await createUserWithToken({
      name: 'Faculty Member',
      email: 'faculty@cui.edu.pk',
      role: 'faculty',
      campus: 'Sahiwal',
      departmentId: department._id,
    });

    oricAdmin = await createUserWithToken({
      name: 'ORIC Admin',
      email: 'oric.admin@cui.edu.pk',
      role: 'oric_admin',
      campus: 'Sahiwal',
    });

    await AuthorProfile.create({
      userId: faculty.user._id,
      departmentId: department._id,
      verifiedEmail: true,
    });

    // Create verified publications
    pub1 = await Publication.create({
      title: 'Paper 1',
      abstract: 'Abstract 1',
      publicationType: 'journal_article',
      authors: [{ authorId: faculty.user._id, order: 1, isCorresponding: true }],
      venue: { name: 'Journal 1', type: 'journal' },
      year: 2023,
      status: 'oric_verified',
      submittedBy: faculty.user._id,
      departmentId: department._id,
      createdBy: faculty.user._id,
      citationCount: 0,
    });

    pub2 = await Publication.create({
      title: 'Paper 2',
      abstract: 'Abstract 2',
      publicationType: 'journal_article',
      authors: [{ authorId: faculty.user._id, order: 1, isCorresponding: true }],
      venue: { name: 'Journal 2', type: 'journal' },
      year: 2023,
      status: 'oric_verified',
      submittedBy: faculty.user._id,
      departmentId: department._id,
      createdBy: faculty.user._id,
      citationCount: 0,
    });

    pub3 = await Publication.create({
      title: 'Paper 3',
      abstract: 'Abstract 3',
      publicationType: 'conference_paper',
      authors: [{ authorId: faculty.user._id, order: 1, isCorresponding: true }],
      venue: { name: 'Conference 1', type: 'conference' },
      year: 2024,
      status: 'oric_verified',
      submittedBy: faculty.user._id,
      departmentId: department._id,
      createdBy: faculty.user._id,
      citationCount: 0,
    });
  });

  describe('POST /api/v1/citations', () => {
    it('should add internal citation and update counts', async () => {
      const res = await request(app)
        .post('/api/v1/citations')
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .send({
          citingPaperId: pub2._id,
          citedPaperId: pub1._id,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.citingPaperId).toBe(pub2._id.toString());
      expect(res.body.data.citedPaperId).toBe(pub1._id.toString());

      // Check citation count updated
      const updatedPub1 = await Publication.findById(pub1._id);
      expect(updatedPub1.citationCount).toBe(1);
      expect(updatedPub1.citedByIds).toContainEqual(pub2._id);

      // Check citing paper has citedByIds reference
      const updatedPub2 = await Publication.findById(pub2._id);
      expect(updatedPub2.citedByIds).toContainEqual(pub1._id);
    });

    it('should add external citation', async () => {
      const res = await request(app)
        .post('/api/v1/citations')
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .send({
          citedPaperId: pub1._id,
          citingPaperExternal: {
            title: 'External Paper',
            authors: ['External Author'],
            venue: 'External Journal',
            year: 2022,
            url: 'https://example.com/paper',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.citingPaperId).toBeNull();
      expect(res.body.data.citingPaperExternal.title).toBe('External Paper');

      // Check citation count updated
      const updatedPub1 = await Publication.findById(pub1._id);
      expect(updatedPub1.citationCount).toBe(1);
    });

    it('should reject citation to non-verified paper', async () => {
      const draftPub = await Publication.create({
        title: 'Draft Paper',
        abstract: 'Draft',
        publicationType: 'journal_article',
        authors: [{ authorId: faculty.user._id, order: 1 }],
        venue: { name: 'Journal', type: 'journal' },
        year: 2024,
        status: 'draft',
        submittedBy: faculty.user._id,
        departmentId: department._id,
        createdBy: faculty.user._id,
      });

      const res = await request(app)
        .post('/api/v1/citations')
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .send({
          citingPaperId: pub2._id,
          citedPaperId: draftPub._id,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('verified');
    });

    it('should reject self-citation', async () => {
      const res = await request(app)
        .post('/api/v1/citations')
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .send({
          citingPaperId: pub1._id,
          citedPaperId: pub1._id,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cannot cite itself');
    });

    it('should reject duplicate citation', async () => {
      await request(app)
        .post('/api/v1/citations')
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .send({
          citingPaperId: pub2._id,
          citedPaperId: pub1._id,
        });

      const res = await request(app)
        .post('/api/v1/citations')
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .send({
          citingPaperId: pub2._id,
          citedPaperId: pub1._id,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject citing non-verified paper', async () => {
      const draftPub = await Publication.create({
        title: 'Draft Citing Paper',
        abstract: 'Draft',
        publicationType: 'journal_article',
        authors: [{ authorId: faculty.user._id, order: 1 }],
        venue: { name: 'Journal', type: 'journal' },
        year: 2024,
        status: 'draft',
        submittedBy: faculty.user._id,
        departmentId: department._id,
        createdBy: faculty.user._id,
      });

      const res = await request(app)
        .post('/api/v1/citations')
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .send({
          citingPaperId: draftPub._id,
          citedPaperId: pub1._id,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('verified');
    });
  });

  describe('GET /api/v1/publications/:id/citations', () => {
    beforeEach(async () => {
      // Add some citations
      await Citation.addCitation({ citingPaperId: pub2._id, citedPaperId: pub1._id });
      await Citation.addCitation({ citingPaperId: pub3._id, citedPaperId: pub1._id });
      await Citation.addCitation({
        citedPaperId: pub1._id,
        citingPaperExternal: { title: 'External Paper', authors: ['Author'], year: 2022 },
      });
    });

    it('should return citation graph with incoming and outgoing', async () => {
      const res = await request(app)
        .get(`/api/v1/publications/${pub1._id}/citations`)
        .set('Authorization', `Bearer ${faculty.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.incoming.length).toBe(3); // 2 internal + 1 external
      expect(res.body.data.outgoing.length).toBe(0);
    });

    it('should show outgoing citations for citing paper', async () => {
      const res = await request(app)
        .get(`/api/v1/publications/${pub2._id}/citations`)
        .set('Authorization', `Bearer ${faculty.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.outgoing.length).toBe(1);
      expect(res.body.data.outgoing[0].paper._id).toBe(pub1._id.toString());
    });
  });

  describe('GET /api/v1/publications/:id/citations/incoming', () => {
    beforeEach(async () => {
      await Citation.addCitation({ citingPaperId: pub2._id, citedPaperId: pub1._id });
      await Citation.addCitation({ citingPaperId: pub3._id, citedPaperId: pub1._id });
    });

    it('should return paginated incoming citations', async () => {
      const res = await request(app)
        .get(`/api/v1/publications/${pub1._id}/citations/incoming`)
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(2);
    });
  });

  describe('GET /api/v1/publications/:id/citations/outgoing', () => {
    beforeEach(async () => {
      await Citation.addCitation({ citingPaperId: pub2._id, citedPaperId: pub1._id });
    });

    it('should return paginated outgoing citations', async () => {
      const res = await request(app)
        .get(`/api/v1/publications/${pub2._id}/citations/outgoing`)
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('DELETE /api/v1/citations/:id', () => {
    it('should delete citation and update counts', async () => {
      const citation = await Citation.addCitation({
        citingPaperId: pub2._id,
        citedPaperId: pub1._id,
      });

      const refreshedPub1 = await Publication.findById(pub1._id);
      expect(refreshedPub1.citationCount).toBe(1);

      const res = await request(app)
        .delete(`/api/v1/citations/${citation._id}`)
        .set('Authorization', `Bearer ${faculty.accessToken}`);

      expect(res.status).toBe(200);

      const updatedPub1 = await Publication.findById(pub1._id);
      expect(updatedPub1.citationCount).toBe(0);
    });
  });

  describe('Citation Count Recalculation', () => {
    it('should recompute citation count correctly', async () => {
      await Citation.addCitation({ citingPaperId: pub2._id, citedPaperId: pub1._id });
      await Citation.addCitation({ citingPaperId: pub3._id, citedPaperId: pub1._id });

      // Manually corrupt count
      await Publication.findByIdAndUpdate(pub1._id, { citationCount: 999 });

      const { citationService } = require('../src/services/citation.service');
      const count = await citationService.recomputeCitationCount(pub1._id);

      expect(count).toBe(2);

      const updated = await Publication.findById(pub1._id);
      expect(updated.citationCount).toBe(2);
    });
  });

  describe('Top Cited Publications', () => {
    beforeEach(async () => {
      await Citation.addCitation({ citingPaperId: pub2._id, citedPaperId: pub1._id });
      await Citation.addCitation({ citingPaperId: pub3._id, citedPaperId: pub1._id });
      await Citation.addCitation({ citingPaperId: pub3._id, citedPaperId: pub2._id });
    });

    it('should return top cited publications', async () => {
      const res = await request(app)
        .get('/api/v1/citations/top')
        .set('Authorization', `Bearer ${faculty.accessToken}`)
        .query({ limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      // pub1 should be top (2 citations)
      expect(res.body.data[0]._id).toBe(pub1._id.toString());
      expect(res.body.data[0].citationCount).toBe(2);
    });
  });
});
