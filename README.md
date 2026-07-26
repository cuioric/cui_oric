<div align="center">

# CUI ORIC
### Faculty Research & Publications Management System

**COMSATS University Islamabad — Sahiwal Campus**
Office of Research, Innovation and Commercialization (ORIC)

[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20TypeScript-61DAFB?logo=react&logoColor=white)](#frontend)
[![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-339933?logo=node.js&logoColor=white)](#backend)
[![Database](https://img.shields.io/badge/database-MongoDB-47A248?logo=mongodb&logoColor=white)](#tech-stack)
[![License](https://img.shields.io/badge/status-active%20development-blue)]()

[Live Demo](https://cui-oric.vercel.app) · [Report a Bug](#) · [Request a Feature](#)

</div>

---

## 📖 About

**CUI ORIC** is a full-stack web platform that digitizes the entire lifecycle of academic
research publications at CUI Sahiwal — from submission by a faculty member or research
student, through Head of Department (HOD) review, to final verification by the ORIC office.
Once verified, publications become part of a public, searchable research repository that
showcases the university's academic output to the outside world.

The system replaces manual, paper-based publication tracking with a transparent,
role-based digital workflow that gives every stakeholder — authors, HODs, and ORIC
administrators — real-time visibility into where a submission stands.

---

## ✨ Key Features

### For Faculty / MS / PhD Students (Authors)
- Create and save publication drafts, upload the manuscript PDF, and submit for review
- Track a submission's live status through the review pipeline
- Resubmit after HOD or ORIC feedback with revision remarks visible in-app
- Personal author profile and publication history

### For Heads of Department (HOD)
- Review all publications submitted by faculty/students in their department
- Approve (forward to ORIC) or return submissions with mandatory, constructive remarks

### For ORIC Administrators
- Final verification authority on all publications
- Full user lifecycle management — approve or reject new faculty/student registrations
- Department management (create, edit, assign HOD, view department-level stats)
- Citation graph curation (bulk import of citation relationships)
- System-wide analytics dashboard

### Public Research Repository
- Publicly browsable, ORIC-verified publication records — no login required
- Search by title/abstract/keyword, filter by department, publication type, year, and
  minimum citation count
- Internal review history, reviewer remarks, and workflow status are never exposed publicly

### Platform-wide
- Secure JWT authentication (short-lived access token + rotating httpOnly refresh token)
- Email verification on signup, followed by ORIC admin approval before account activation
- Role-based access control enforced at the API layer for every resource
- Automated transactional emails (verification, password reset, review decisions, account
  approval/rejection)
- Progressive account lockout after repeated failed login attempts
- PDF-only upload validation with a 20 MB size limit, stored on AWS S3
- Background AI-assisted review pass on uploaded manuscripts

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, React Hook Form + Zod |
| **Backend** | Node.js, Express.js, MongoDB + Mongoose |
| **Auth** | JWT (access + refresh tokens), bcrypt |
| **File Storage** | AWS S3 |
| **Transactional Email** | Brevo (Sendinblue) API |
| **Frontend Hosting** | Vercel |
| **Backend Hosting** | Railway |
| **Database Hosting** | MongoDB Atlas |

---

## 📁 Repository Structure

```
cui_oric/
├── cui-oric-frontend/     # React + TypeScript SPA
│   ├── src/
│   │   ├── pages/         # Route-level pages (public, auth, publications, admin, dashboard)
│   │   ├── components/    # Shared UI components, route guards
│   │   ├── contexts/      # Auth context/provider
│   │   ├── lib/           # Centralized API client (axios + interceptors)
│   │   └── types/         # Shared TypeScript types
│   ├── index.html
│   └── vercel.json        # SPA rewrite rules
│
└── cui-oric-backend/      # Express + MongoDB REST API
    ├── src/
    │   ├── models/        # Mongoose schemas (User, Publication, Department, Citation)
    │   ├── controllers/   # Route handlers / business logic
    │   ├── routes/         # Express routers, mounted under /api/v1
    │   ├── middleware/    # Auth, RBAC, rate limiting, upload validation
    │   ├── services/      # Email service, AI review service
    │   └── config/        # Environment, logger, Swagger config
    └── server.js
```

---

## 🔄 Publication Workflow

```
draft → submitted_to_hod → sent_to_oric → oric_verified   (published to public repository)
             │                   │
             ▼                   ▼
       hod_rejected        oric_rejected
             │                   │
             └────► draft (edit & resubmit) ◄────┘
```

## 👥 User Roles

| Role | Description |
|---|---|
| `faculty` | Academic staff — can author and submit publications |
| `ms_student` / `phd_student` | Research students — can author and submit publications |
| `hod` | Head of Department — first-level reviewer for their department |
| `oric_admin` | Full administrative access — final review, user & department management |

New accounts start as `pending_email_verification` → `pending_oric_approval` → `active`
(or `rejected`) before a user can sign in.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- A MongoDB database (local or [MongoDB Atlas](https://cloud.mongodb.com))
- An AWS S3 bucket (for PDF storage)
- A [Brevo](https://www.brevo.com) account (for transactional email)

### Backend Setup

```bash
cd cui-oric-backend
npm install
cp .env.example .env    # fill in the values below
npm run seed             # optional: creates demo accounts
npm run dev               # starts on http://localhost:5000
```

**Required environment variables** (`.env`):

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://...
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
FACULTY_EMAIL_DOMAIN=cuisahiwal.edu.pk
STUDENT_EMAIL_DOMAIN=students.cuisahiwal.edu.pk
BREVO_API_KEY=
EMAIL_FROM=noreply@cui-oric.com
EMAIL_FROM_NAME=CUI ORIC
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET=
MAX_PDF_SIZE_MB=20
CORS_ORIGIN=http://localhost:3000
```

### Frontend Setup

```bash
cd cui-oric-frontend
npm install
cp .env.example .env    # fill in the values below
npm run dev               # starts on http://localhost:3000
```

**Required environment variables** (`.env`):

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_FACULTY_EMAIL_DOMAIN=cuisahiwal.edu.pk
VITE_STUDENT_EMAIL_DOMAIN=students.cuisahiwal.edu.pk
```

> The two email-domain variables must always match between frontend and backend.

---

## ☁️ Deployment

| Service | Platform |
|---|---|
| Frontend | [Vercel](https://vercel.com) — auto-deploys on push to `main` |
| Backend | [Railway](https://railway.app) — auto-deploys on push to `main` |
| Database | MongoDB Atlas |

After deploying, set `CORS_ORIGIN` on the backend to the exact production frontend URL,
and `VITE_API_BASE_URL` on the frontend to the backend's `/api/v1` endpoint.

---

## 🔒 Security Notes

- All API routes are protected by role-based middleware — access is enforced server-side,
  never assumed from the UI alone.
- Refresh tokens are stored as httpOnly cookies and hashed server-side.
- Passwords are hashed with bcrypt; failed login attempts trigger a progressive account
  lockout.
- Uploaded files are restricted to PDF, validated by both MIME type and extension, and
  capped at 20 MB.

---

## 📄 License

Internal project — COMSATS University Islamabad, Sahiwal Campus, ORIC Office.
All rights reserved.
