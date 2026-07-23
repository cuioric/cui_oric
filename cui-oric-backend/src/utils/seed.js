/**
 * Database Seed Script
 * Creates demo accounts and sample data for testing
 */

require('dotenv').config({ path: '.env' });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Department = require('../models/Department');
const AuthorProfile = require('../models/AuthorProfile');
const Publication = require('../models/Publication');
const PublicationReview = require('../models/PublicationReview');
const ResearchInterest = require('../models/ResearchInterest');
const config = require('../config/env');
const logger = require('../config/logger');

const seedData = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB for seeding');

    // Clear existing data (optional - comment out for production)
    // await Promise.all([
    //   User.deleteMany({}),
    //   Department.deleteMany({}),
    //   AuthorProfile.deleteMany({}),
    //   Publication.deleteMany({}),
    //   PublicationReview.deleteMany({}),
    //   ResearchInterest.deleteMany({}),
    // ]);

    // 1. Create Departments
    const departments = await Department.insertMany([
      { name: 'Department of Computer Science', campus: 'Sahiwal' },
      { name: 'Department of Electrical Engineering', campus: 'Sahiwal' },
      { name: 'Department of Mechanical Engineering', campus: 'Sahiwal' },
      { name: 'Department of Mathematics', campus: 'Sahiwal' },
      { name: 'Department of Physics', campus: 'Sahiwal' },
    ], { ordered: false });

    logger.info(`Created ${departments.length} departments`);

    // 2. Create ORIC Admin
    const oricAdmin = await User.create({
      name: 'ORIC Administrator',
      email: 'oric.admin@cuisahiwal.edu.pk',
      password: 'Admin@123', // Will be hashed
      role: 'oric_admin',
      campus: 'Sahiwal',
      status: 'active',
      departmentId: null,
    });
    logger.info('Created ORIC Admin');

    // 3. Create HODs
    const hods = [];
    for (let i = 0; i < departments.length; i++) {
      const hod = await User.create({
        name: `Dr. HOD ${departments[i].name.split(' ').pop()}`,
        email: `hod.${departments[i].name.toLowerCase().replace(/\s+/g, '.')}@cuisahiwal.edu.pk`,
        password: 'Hod@1234',
        role: 'hod',
        campus: 'Sahiwal',
        status: 'active',
        departmentId: departments[i]._id,
      });
      hods.push(hod);

      // Assign HOD to department
      departments[i].hodId = hod._id;
      await departments[i].save();

      // Create author profile
      await AuthorProfile.create({
        userId: hod._id,
        departmentId: departments[i]._id,
        designation: 'Head of Department',
        affiliation: 'COMSATS University Islamabad, Sahiwal Campus',
        verifiedEmail: true,
      });
    }
    logger.info(`Created ${hods.length} HODs`);

    // 4. Create Faculty Members
    const faculty = [];
    const facultyData = [
      { name: 'Dr. Ahmad Khan', email: 'ahmad.khan@cuisahiwal.edu.pk', dept: 0, designation: 'Professor' },
      { name: 'Dr. Fatima Ali', email: 'fatima.ali@cuisahiwal.edu.pk', dept: 0, designation: 'Associate Professor' },
      { name: 'Dr. Muhammad Hassan', email: 'muhammad.hassan@cuisahiwal.edu.pk', dept: 1, designation: 'Assistant Professor' },
      { name: 'Dr. Ayesha Malik', email: 'ayesha.malik@cuisahiwal.edu.pk', dept: 1, designation: 'Professor' },
      { name: 'Dr. Usman Ahmed', email: 'usman.ahmed@cuisahiwal.edu.pk', dept: 2, designation: 'Associate Professor' },
      { name: 'Dr. Sara Mahmood', email: 'sara.mahmood@cuisahiwal.edu.pk', dept: 3, designation: 'Assistant Professor' },
    ];

    for (const f of facultyData) {
      const user = await User.create({
        name: f.name,
        email: f.email,
        password: 'Faculty@123',
        role: 'faculty',
        campus: 'Sahiwal',
        status: 'active',
        departmentId: departments[f.dept]._id,
      });
      faculty.push(user);

      await AuthorProfile.create({
        userId: user._id,
        departmentId: departments[f.dept]._id,
        designation: f.designation,
        affiliation: 'COMSATS University Islamabad, Sahiwal Campus',
        researchInterests: ['machine learning', 'data science', 'artificial intelligence'].slice(0, 2),
        verifiedEmail: true,
      });
    }
    logger.info(`Created ${faculty.length} faculty members`);

    // 5. Create MS Students
    const msStudents = [];
    const msData = [
      { name: 'Ali Raza', email: 'ali.raza@students.cuisahiwal.edu.pk', dept: 0 },
      { name: 'Zainab Bibi', email: 'zainab.bibi@students.cuisahiwal.edu.pk', dept: 0 },
      { name: 'Hassan Ali', email: 'hassan.ali@students.cuisahiwal.edu.pk', dept: 1 },
      { name: 'Maryam Khan', email: 'maryam.khan@students.cuisahiwal.edu.pk', dept: 2 },
    ];

    for (const s of msData) {
      const user = await User.create({
        name: s.name,
        email: s.email,
        password: 'Student@123',
        role: 'ms_student',
        campus: 'Sahiwal',
        status: 'active',
        departmentId: departments[s.dept]._id,
      });
      msStudents.push(user);

      await AuthorProfile.create({
        userId: user._id,
        departmentId: departments[s.dept]._id,
        designation: 'MS Student',
        affiliation: 'COMSATS University Islamabad, Sahiwal Campus',
        verifiedEmail: true,
      });
    }
    logger.info(`Created ${msStudents.length} MS students`);

    // 6. Create PhD Students
    const phdStudents = [];
    const phdData = [
      { name: 'Kamran Shah', email: 'kamran.shah@students.cuisahiwal.edu.pk', dept: 0 },
      { name: 'Nadia Hassan', email: 'nadia.hassan@students.cuisahiwal.edu.pk', dept: 1 },
    ];

    for (const s of phdData) {
      const user = await User.create({
        name: s.name,
        email: s.email,
        password: 'Student@123',
        role: 'phd_student',
        campus: 'Sahiwal',
        status: 'active',
        departmentId: departments[s.dept]._id,
      });
      phdStudents.push(user);

      await AuthorProfile.create({
        userId: user._id,
        departmentId: departments[s.dept]._id,
        designation: 'PhD Scholar',
        affiliation: 'COMSATS University Islamabad, Sahiwal Campus',
        verifiedEmail: true,
      });
    }
    logger.info(`Created ${phdStudents.length} PhD students`);

    // 7. Create Research Interests
    const interests = [
      'machine learning', 'deep learning', 'artificial intelligence', 'data mining',
      'computer vision', 'natural language processing', 'robotics', 'control systems',
      'power electronics', 'renewable energy', 'signal processing', 'wireless communications',
      'thermodynamics', 'fluid mechanics', 'manufacturing', 'materials science',
      'applied mathematics', 'numerical analysis', 'optimization', 'statistics',
      'quantum mechanics', 'condensed matter physics', 'particle physics', 'astrophysics',
    ];

    await ResearchInterest.insertMany(
      interests.map((tag) => ({ tag, followerCount: 0 })),
      { ordered: false }
    );
    logger.info(`Created ${interests.length} research interests`);

    // 8. Create Sample Publications
    const allAuthors = [...faculty, ...msStudents, ...phdStudents];
    const publications = [];

    // Draft publications (2 per faculty)
    for (let i = 0; i < faculty.length; i++) {
      for (let j = 0; j < 2; j++) {
        const pub = await Publication.create({
          title: `Draft Paper ${j + 1} by ${faculty[i].name}`,
          abstract: `This is a draft abstract for paper ${j + 1} by ${faculty[i].name}. It discusses recent advances in the field.`,
          publicationType: 'journal_article',
          authors: [
            { authorId: faculty[i]._id, order: 1, isCorresponding: true },
            { authorId: allAuthors[(i + 1) % allAuthors.length]._id, order: 2, isCorresponding: false },
          ],
          venue: {
            name: 'IEEE Transactions on Sample',
            type: 'journal',
            volume: '10',
            issue: '2',
            pages: '1-10',
            impactFactor: 3.5,
          },
          year: 2024,
          publicationDate: new Date('2024-06-15'),
          doi: `10.1109/SAMPLE.2024.${1000 + i * 2 + j}`,
          keywords: ['draft', 'sample', 'research'],
          status: 'draft',
          submittedBy: faculty[i]._id,
          departmentId: faculty[i].departmentId,
          createdBy: faculty[i]._id,
        });
        publications.push(pub);
      }
    }

    // Submitted to HOD publications
    for (let i = 0; i < 3; i++) {
      const author = faculty[i];
      const pub = await Publication.create({
        title: `Submitted Paper ${i + 1} by ${author.name}`,
        abstract: `This paper has been submitted for HOD review.`,
        publicationType: 'conference_paper',
        authors: [
          { authorId: author._id, order: 1, isCorresponding: true },
        ],
        venue: {
          name: 'International Conference on Sample Research',
          type: 'conference',
          pages: '100-105',
        },
        year: 2024,
        publicationDate: new Date('2024-08-01'),
        doi: `10.1109/SUBMITTED.2024.${2000 + i}`,
        keywords: ['submitted', 'conference'],
        status: 'submitted_to_hod',
        submittedBy: author._id,
        departmentId: author.departmentId,
        createdBy: author._id,
        lastRemarks: 'Please review for submission',
      });
      publications.push(pub);

      // Add review record
      await PublicationReview.createReview({
        publicationId: pub._id,
        stage: 'hod_review',
        reviewedBy: author._id,
        decision: 'returned_for_correction',
        remarks: 'Submitted for HOD review',
        previousStatus: 'draft',
        newStatus: 'submitted_to_hod',
      });
    }

    // HOD Approved / Sent to ORIC publications
    for (let i = 0; i < 3; i++) {
      const author = faculty[(i + 2) % faculty.length];
      const hod = hods[departments.findIndex((d) => d._id.toString() === author.departmentId.toString())];
      const pub = await Publication.create({
        title: `ORIC Pending Paper ${i + 1} by ${author.name}`,
        abstract: `This paper has been approved by HOD and sent to ORIC.`,
        publicationType: 'journal_article',
        authors: [
          { authorId: author._id, order: 1, isCorresponding: true },
        ],
        venue: {
          name: 'Journal of Sample Research',
          type: 'journal',
          volume: '15',
          issue: '3',
          pages: '45-60',
          impactFactor: 4.2,
        },
        year: 2024,
        publicationDate: new Date('2024-07-15'),
        doi: `10.1109/ORIC.2024.${3000 + i}`,
        keywords: ['oric', 'verified'],
        status: 'sent_to_oric',
        submittedBy: author._id,
        departmentId: author.departmentId,
        createdBy: author._id,
        lastRemarks: 'HOD approved, sent to ORIC',
      });
      publications.push(pub);

      // Add review records
      await PublicationReview.createReview({
        publicationId: pub._id,
        stage: 'hod_review',
        reviewedBy: hod._id,
        decision: 'approved',
        remarks: 'Approved by HOD',
        previousStatus: 'submitted_to_hod',
        newStatus: 'sent_to_oric',
      });
    }

    // ORIC Verified publications (with citations)
    for (let i = 0; i < 5; i++) {
      const author = faculty[i % faculty.length];
      const hod = hods[departments.findIndex((d) => d._id.toString() === author.departmentId.toString())];
      const pub = await Publication.create({
        title: `Verified Paper ${i + 1} by ${author.name}`,
        abstract: `This paper has been verified by ORIC and is publicly visible.`,
        publicationType: i % 2 === 0 ? 'journal_article' : 'conference_paper',
        authors: [
          { authorId: author._id, order: 1, isCorresponding: true },
          { authorId: allAuthors[(i + 2) % allAuthors.length]._id, order: 2, isCorresponding: false },
        ],
        venue: {
          name: i % 2 === 0 ? 'IEEE Access' : 'ACM Conference on Computing',
          type: i % 2 === 0 ? 'journal' : 'conference',
          volume: i % 2 === 0 ? '12' : undefined,
          issue: i % 2 === 0 ? '4' : undefined,
          pages: i % 2 === 0 ? '50000-50020' : '200-205',
          impactFactor: i % 2 === 0 ? 3.9 : null,
        },
        year: 2023 + (i % 2),
        publicationDate: new Date(`${2023 + (i % 2)}-${(i % 12) + 1}-15`),
        doi: `10.1109/VERIFIED.${2023 + (i % 2)}.${4000 + i}`,
        url: `https://doi.org/10.1109/VERIFIED.${2023 + (i % 2)}.${4000 + i}`,
        keywords: ['verified', 'published', 'open access'],
        status: 'oric_verified',
        submittedBy: author._id,
        departmentId: author.departmentId,
        createdBy: author._id,
        citationCount: Math.floor(Math.random() * 50) + 5,
        lastRemarks: 'ORIC verified',
        aiReview: {
          virusScanStatus: 'clean',
          readabilityScore: 65 + (i * 3),
          plagiarismScore: 5 + (i * 2),
          grammarIssuesCount: 2 + i,
          passiveVoicePercentage: 15 + (i * 2),
          checkedAt: new Date(),
        },
      });
      publications.push(pub);

      // Add review records
      await PublicationReview.createReview({
        publicationId: pub._id,
        stage: 'hod_review',
        reviewedBy: hod._id,
        decision: 'approved',
        remarks: 'Approved by HOD',
        previousStatus: 'submitted_to_hod',
        newStatus: 'sent_to_oric',
      });

      await PublicationReview.createReview({
        publicationId: pub._id,
        stage: 'oric_review',
        reviewedBy: oricAdmin._id,
        decision: 'approved',
        remarks: 'Verified by ORIC',
        previousStatus: 'sent_to_oric',
        newStatus: 'oric_verified',
      });
    }

    // HOD Rejected publications
    for (let i = 0; i < 2; i++) {
      const author = faculty[(i + 3) % faculty.length];
      const hod = hods[departments.findIndex((d) => d._id.toString() === author.departmentId.toString())];
      const pub = await Publication.create({
        title: `Rejected Paper ${i + 1} by ${author.name}`,
        abstract: `This paper was rejected by HOD.`,
        publicationType: 'journal_article',
        authors: [
          { authorId: author._id, order: 1, isCorresponding: true },
        ],
        venue: {
          name: 'Some Journal',
          type: 'journal',
        },
        year: 2024,
        status: 'hod_rejected',
        submittedBy: author._id,
        departmentId: author.departmentId,
        createdBy: author._id,
        lastRemarks: 'Needs significant revision',
      });
      publications.push(pub);

      await PublicationReview.createReview({
        publicationId: pub._id,
        stage: 'hod_review',
        reviewedBy: hod._id,
        decision: 'rejected',
        remarks: 'Needs significant revision',
        previousStatus: 'submitted_to_hod',
        newStatus: 'hod_rejected',
      });
    }

    // ORIC Rejected publications
    for (let i = 0; i < 1; i++) {
      const author = faculty[0];
      const hod = hods[departments.findIndex((d) => d._id.toString() === author.departmentId.toString())];
      const pub = await Publication.create({
        title: `ORIC Rejected Paper by ${author.name}`,
        abstract: `This paper was rejected by ORIC.`,
        publicationType: 'conference_paper',
        authors: [
          { authorId: author._id, order: 1, isCorresponding: true },
        ],
        venue: {
          name: 'Some Conference',
          type: 'conference',
        },
        year: 2023,
        status: 'oric_rejected',
        submittedBy: author._id,
        departmentId: author.departmentId,
        createdBy: author._id,
        lastRemarks: 'Does not meet ORIC standards',
      });
      publications.push(pub);

      await PublicationReview.createReview({
        publicationId: pub._id,
        stage: 'hod_review',
        reviewedBy: hod._id,
        decision: 'approved',
        remarks: 'Approved by HOD',
        previousStatus: 'submitted_to_hod',
        newStatus: 'sent_to_oric',
      });

      await PublicationReview.createReview({
        publicationId: pub._id,
        stage: 'oric_review',
        reviewedBy: oricAdmin._id,
        decision: 'rejected',
        remarks: 'Does not meet ORIC standards',
        previousStatus: 'sent_to_oric',
        newStatus: 'oric_rejected',
      });
    }

    logger.info(`Created ${publications.length} sample publications`);

    // 9. Add some citations between verified publications
    const verifiedPubs = publications.filter((p) => p.status === 'oric_verified');
    const Citation = require('../models/Citation');

    for (let i = 0; i < verifiedPubs.length; i++) {
      for (let j = 0; j < Math.min(2, verifiedPubs.length - 1); j++) {
        const citingIdx = (i + j + 1) % verifiedPubs.length;
        if (citingIdx !== i) {
          try {
            await Citation.addCitation({
              citingPaperId: verifiedPubs[citingIdx]._id,
              citedPaperId: verifiedPubs[i]._id,
            });
          } catch (e) {
            // Ignore duplicates
          }
        }
      }
    }

    logger.info('Added sample citations');

    // 10. Update research interest follower counts
    for (const profile of await AuthorProfile.find()) {
      for (const interest of profile.researchInterests || []) {
        await ResearchInterest.findOneAndUpdate(
          { tag: interest },
          { $inc: { followerCount: 1 } },
          { upsert: true }
        );
      }
    }

    logger.info('Updated research interest follower counts');

    // 11. Recompute metrics for all authors
    for (const profile of await AuthorProfile.find()) {
      try {
        const { metricsService } = require('../services/metrics.service');
        await metricsService.recomputeAuthorMetrics(profile._id);
      } catch (e) {
        logger.warn(`Failed to recompute metrics for ${profile._id}:`, e.message);
      }
    }

    logger.info('Recomputed author metrics');

    // 12. Print summary
    console.log('\n=== SEED SUMMARY ===');
    console.log(`ORIC Admin: oric.admin@cuisahiwal.edu.pk / Admin@123`);
    console.log(`HODs:`);
    hods.forEach((h) => console.log(`  ${h.email} / Hod@1234`));
    console.log(`Faculty:`);
    faculty.forEach((f) => console.log(`  ${f.email} / Faculty@123`));
    console.log(`MS Students:`);
    msStudents.forEach((s) => console.log(`  ${s.email} / Student@123`));
    console.log(`PhD Students:`);
    phdStudents.forEach((s) => console.log(`  ${s.email} / Student@123`));
    console.log(`Departments: ${departments.length}`);
    console.log(`Publications: ${publications.length}`);
    console.log(`  Draft: ${publications.filter(p => p.status === 'draft').length}`);
    console.log(`  Submitted to HOD: ${publications.filter(p => p.status === 'submitted_to_hod').length}`);
    console.log(`  Sent to ORIC: ${publications.filter(p => p.status === 'sent_to_oric').length}`);
    console.log(`  ORIC Verified: ${publications.filter(p => p.status === 'oric_verified').length}`);
    console.log(`  HOD Rejected: ${publications.filter(p => p.status === 'hod_rejected').length}`);
    console.log(`  ORIC Rejected: ${publications.filter(p => p.status === 'oric_rejected').length}`);
    console.log('====================\n');

    await mongoose.disconnect();
    logger.info('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
};

// Run if executed directly
if (require.main === module) {
  seedData();
}

module.exports = { seedData };