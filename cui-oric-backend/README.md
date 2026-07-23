# CUI ORIC - Faculty Research & Publications Management System

Production-grade backend for COMSATS University Islamabad, Sahiwal Campus - Office of Research, Innovation and Commercialization (ORIC).

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ (LTS)
- MongoDB 6+ (local or Atlas)
- ClamAV daemon (`clamd`) running on localhost:3310
- AWS S3 bucket with CloudFront (for file storage)
- SMTP server for emails

### Installation

```bash
# Clone and install dependencies
cd cui-oric-backend
npm install

# Copy environment template
cp .env.example .env

# Configure .env with your values (see Environment Variables below)

# Run database seed (creates demo accounts)
npm run seed

# Start development server
npm run dev
```

Server runs at `http://localhost:5000` with API docs at `http://localhost:5000/api/v1/docs`

### Demo Accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| ORIC Admin | oric.admin@cui.edu.pk | Admin@123 |
| HOD (CS) | hod.computer.science@cui.edu.pk | Hod@123 |
| Faculty | ahmad.khan@cui.edu.pk | Faculty@123 |
| MS Student | ali.raza@cui.edu.pk | Student@123 |
| PhD Student | kamran.shah@cui.edu.pk | Student@123 |

## 📋 Environment Variables

See `.env.example` for all required variables. Key variables:

```bash
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/cui-oric

# JWT (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_ACCESS_SECRET=your-32-char-secret
JWT_REFRESH_SECRET=your-32-char-secret
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Email Domain
FACULTY_EMAIL_DOMAIN=cuisahiwal.edu.pk
STUDENT_EMAIL_DOMAIN=students.cuisahiwal.edu.pk

# SMTP
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=user
EMAIL_SMTP_PASS=pass
EMAIL_FROM=noreply@cui.edu.pk

# AWS S3
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
AWS_S3_BUCKET=cui-oric-publications
AWS_CLOUDFRONT_DOMAIN=xxxx.cloudfront.net

# ClamAV
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# File Upload
MAX_PDF_SIZE_MB=20

# CORS
CORS_ORIGIN=http://localhost:3000
```

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Node.js 20 LTS + Express.js
- **Database**: MongoDB + Mongoose ODM
- **Auth**: JWT (access + refresh rotation) + bcrypt
- **Storage**: AWS S3 (private) + CloudFront CDN
- **Virus Scan**: ClamAV via `clamscan` npm package
- **PDF Processing**: `pdf-parse` for metadata extraction
- **Readability**: `text-readability` (Flesch-Kincaid)
- **Grammar/Style**: `retext` + `retext-passive` + `write-good`
- **Validation**: `express-validator` + `zod`
- **Security**: `helmet`, `express-rate-limit`, `express-mongo-sanitize`, `hpp`
- **Logging**: `winston` + `morgan`
- **Testing**: `jest` + `supertest`
- **API Docs**: `swagger-jsdoc` + `swagger-ui-express`

### Project Structure
```
cui-oric-backend/
├── src/
│   ├── config/         # DB, env, S3, logger
│   ├── models/         # Mongoose models
│   ├── controllers/    # Route handlers
│   ├── routes/         # Express routers
│   ├── middleware/     # Auth, RBAC, validation, upload, virus scan
│   ├── services/       # Business logic (email, S3, AI review, metrics, citations)
│   ├── utils/          # Helpers (errors, responses, async wrapper)
│   ├── validators/     # Request validation schemas
│   └── app.js          # Express app setup
├── tests/              # Integration tests
├── .env.example        # Environment template
└── server.js           # Entry point
```

## 🔐 Authentication & Authorization

### User Roles
- `oric_admin` - Full system access
- `hod` - Department-scoped publication review
- `faculty` - Create/manage own publications
- `ms_student` - Create/manage own publications
- `phd_student` - Create/manage own publications

### Registration Flow
1. `POST /api/v1/auth/register` - Create account (status: `pending_email_verification`)
2. `GET /api/v1/auth/verify-email/:token` - Verify email (status: `pending_oric_approval`)
3. ORIC Admin approves via `PATCH /api/v1/admin/users/:id/approve` (status: `active`)
4. `POST /api/v1/auth/login` - Get access + refresh tokens

### Token Management
- Access tokens: 15 min, JWT in Authorization header
- Refresh tokens: 7 days, httpOnly cookie, rotated on use
- Refresh endpoint: `POST /api/v1/auth/refresh`

### RBAC Enforcement
Every protected route uses `requireRole(...)` middleware. Department scoping enforced for HOD actions.

## 📚 Publication Workflow

### State Machine (Strictly Enforced)

```
draft → submitted_to_hod → hod_approved → sent_to_oric → oric_verified
                    ↘ hod_rejected                    ↘ oric_rejected
hod_rejected → draft (revision)
oric_rejected → draft (revision)
```

### Key Rules
- Only owner can create/edit drafts
- Only department HOD can review `submitted_to_hod`
- Only ORIC Admin can review `sent_to_oric`
- Every transition creates `PublicationReview` audit record
- `lastRemarks` mirrored to publication
- Only `oric_verified` publications count toward metrics

### Publication Endpoints
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/publications` | Author | Create draft |
| PATCH | `/publications/:id` | Owner | Edit draft |
| POST | `/publications/:id/submit` | Owner | Submit to HOD |
| POST | `/publications/:id/hod-review` | HOD | Approve/Reject |
| POST | `/publications/:id/oric-review` | ORIC Admin | Verify/Reject |
| GET | `/publications` | Public* | List (verified only) |
| GET | `/publications/:id` | Scoped | Get details |
| DELETE | `/publications/:id` | ORIC Admin | Delete |
| PATCH | `/publications/:id/metadata` | ORIC Admin | Correct metadata |
| POST | `/publications/:id/upload-pdf` | Owner | Upload PDF |
| GET | `/publications/:id/download` | Scoped | Get download URL |

*Unauthenticated users see only `oric_verified` publications

## 📄 PDF Handling & AI Review

### Upload Pipeline
1. Validate: PDF only, ≤20MB, magic bytes check
2. Virus scan via ClamAV (local `clamd`)
3. If infected: delete from S3, reject upload
4. If clean: upload to private S3, run AI analysis

### AI Analysis (Parallel)
- **Metadata extraction**: Title, authors, keywords from PDF
- **Readability**: Flesch-Kincaid grade level + reading ease
- **Grammar**: `write-good` issue count
- **Passive voice**: `retext-passive` percentage
- **Plagiarism**: LanguageTool API (optional, via env)

### Results Storage
Quantitative scores stored in `publication.aiReview`:
```javascript
{
  virusScanStatus: 'clean' | 'infected' | 'pending',
  readabilityScore: 0-100,
  plagiarismScore: 0-100,
  grammarIssuesCount: Number,
  passiveVoicePercentage: 0-100,
  checkedAt: Date
}
```

Qualitative suggestions returned in API response only (not persisted).

### Downloads
- Pre-signed S3 URLs (1 hour expiry)
- Unverified PDFs not downloadable by public

## 🔍 Search & Discovery

### Endpoints
- `GET /api/v1/search/publications` - Full-text + filters
- `GET /api/v1/search/suggestions` - Autocomplete
- `GET /api/v1/search/filters` - Filter options
- `POST /api/v1/search/advanced` - Complex queries

### Filters
- Full-text: title, abstract, authors, venue, keywords, DOI
- Year, citation count, department, research interest, publication type
- Only `oric_verified` for public users

## 📊 Citations

### Internal Citations
- Link two verified publications
- Auto-updates `citationCount` and `citedByIds`

### External Citations
- Store title, authors, venue, year, URL
- Counts toward cited paper's citation count

### Citation Graph
- `GET /publications/:id/citations` - Incoming + outgoing
- Pagination support
- Department citation statistics

## 📈 Analytics & Dashboards

### Institution Dashboard (ORIC Admin)
- User stats, publication stats, citation metrics
- Top authors by h-index
- Review workload (pending HOD/ORIC reviews)
- AI review statistics
- Recent activity

### Department Dashboard (HOD)
- Department-scoped version of institution dashboard
- Faculty/student counts
- Department publications by year/type
- Pending reviews for department

### Moderation Dashboards
- Stage 1: `submitted_to_hod` queue (HOD + ORIC Admin)
- Stage 2: `sent_to_oric` queue (ORIC Admin)
- AI review scores surfaced for quick assessment

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/auth.test.js
```

### Test Coverage
- Auth flow: registration, verification, login, refresh, logout, password reset
- RBAC: all role permissions, department scoping, ownership checks
- Publication workflow: all valid/invalid transitions, review records
- Citations: internal/external, count updates, graph, deduplication

## 🛡️ Security Checklist

- [x] Helmet with CSP
- [x] Rate limiting (strict on auth)
- [x] MongoDB sanitization + HPP
- [x] CORS whitelist
- [x] Input validation on all routes
- [x] bcrypt cost ≥12
- [x] JWT secrets ≥32 bytes
- [x] Refresh token rotation + hashing
- [x] RBAC + ownership on every mutating route
- [x] File upload: MIME sniff, size limit, virus scan
- [x] Private S3 + pre-signed URLs
- [x] No stack traces in production
- [x] Audit trail (append-only reviews)
- [x] `.env` gitignored, `.env.example` committed
- [x] Dependency audit clean

## 📦 Deployment Notes

### Production Checklist
1. Set `NODE_ENV=production`
2. Use strong JWT secrets (32+ random bytes)
3. Configure production MongoDB (Atlas recommended)
4. Set up AWS S3 bucket with CloudFront
5. Configure SMTP for emails
6. Run ClamAV daemon cluster (not single instance)
7. Set up reverse proxy (nginx) with SSL
8. Configure log rotation
9. Set up monitoring (PM2, health checks)
10. Run `npm audit` and fix vulnerabilities

### Docker (Optional)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🏗️ Infrastructure Notes

**The following pieces require manual cloud provisioning outside this codebase:**

| Component | Description | Provisioning Method |
|-----------|-------------|---------------------|
| **AWS S3 Bucket** | Private bucket for PDF storage with versioning | AWS Console / Terraform |
| **CloudFront Distribution** | CDN for pre-signed URL downloads | AWS Console / Terraform |
| **S3 Event Notifications** | Trigger Lambda on upload (production replacement for local ClamAV) | AWS Console / Terraform |
| **AWS Lambda (Virus Scan)** | ClamAV scanning via Lambda (replaces local `clamd`) | AWS Console / Terraform / SAM |
| **AWS Lambda (AI Review)** | Async AI processing pipeline (optional) | AWS Console / Terraform |
| **Production ClamAV** | High-availability ClamAV cluster (ECS/EKS or managed) | AWS Console / Terraform |
| **Production Email Service** | SES, SendGrid, or similar for reliable delivery | AWS Console / Third-party |
| **LanguageTool/Plagiarism API** | External grammar/plagiarism service (Turnitin, Copyscape, etc.) | Third-party vendor |
| **MongoDB Atlas** | Managed MongoDB (recommended for production) | MongoDB Atlas Console |
| **SSL/TLS Certificates** | ACM or Let's Encrypt for HTTPS | AWS ACM / Certbot |
| **Secrets Management** | AWS Secrets Manager / Parameter Store for production secrets | AWS Console / Terraform |

**Local Development Substitutions:**
- ClamAV: Local `clamd` daemon via `clamscan` npm package (this codebase)
- AI Review: Synchronous in-process via `pdf-parse`, `text-readability`, `retext`, `write-good`
- Email: Logged to console in development, queued with retry in production
- S3: LocalStack or MinIO can be used for local testing

**To swap local ClamAV for Lambda:**
1. Remove `virusScanMiddleware` from upload route
2. Add S3 event notification → Lambda function
3. Lambda downloads object, scans with ClamAV, updates `aiReview.virusScanStatus` via API
4. No schema or API contract changes needed

## 📝 API Documentation

Interactive Swagger UI available at:
- Development: `http://localhost:5000/api/v1/docs`
- Production: `https://api.yourdomain.com/api/v1/docs`

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Run linter (`npm run lint`)
6. Run audit (`npm run audit`)
7. Submit PR

## 📄 License

Proprietary - COMSATS University Islamabad, Sahiwal Campus

## 📞 Support

ORIC Sahiwal Campus: `oric@csahiwal.edu.pk`