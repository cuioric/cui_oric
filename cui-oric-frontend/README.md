# CUI ORIC — Research & Publications Frontend

A responsive React 18 + TypeScript frontend for the **CUI ORIC Faculty Research & Publications Management System**. It was built against the extracted Express/MongoDB source in `../backend/cui-oric-backend-new/cui-oric-backend`, not against the backend README.

## Run locally

```bash
cd /home/user/cui-oric-frontend
npm install
npm run dev
```

The Vite server is intentionally fixed to **http://localhost:3000**, which matches the backend's default `CORS_ORIGIN`. The frontend's default API prefix is:

```dotenv
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Edit `.env` when the deployed API URL is available, then restart Vite. Keep the two email-domain variables aligned with the backend deployment's `FACULTY_EMAIL_DOMAIN` and `STUDENT_EMAIL_DOMAIN` values:

```dotenv
VITE_FACULTY_EMAIL_DOMAIN=cuisahiwal.edu.pk
VITE_STUDENT_EMAIL_DOMAIN=students.cuisahiwal.edu.pk
```

## Verification performed against source

The following backend source files were read before wiring the client:

- `src/app.js`
- all `src/routes/*.js`
- all `src/controllers/*.js`
- all `src/models/*.js`
- `src/middleware/validate.js`, `auth.js`, `rbac.js`, and `upload.js`
- `src/config/env.js` and `src/utils/apiResponse.js`

Important source-verified behaviors implemented in the UI:

- API root is `/api/v1`; auth refresh is `POST /auth/refresh`, using the httpOnly refresh cookie.
- Access tokens live only in React memory. Axios attaches them as Bearer tokens, refreshes exactly once on a 401, retries once, then clears the session and redirects to login if refresh fails.
- Registration accepts only `faculty`, `ms_student`, and `phd_student`. The role-specific email domain hints match `env.js` defaults.
- The verification endpoint is `GET /auth/verify-email/:token`; successful verification leads to `pending_oric_approval`.
- Publication PDF upload is `POST /publications/:id/upload-pdf` with multipart field **`pdf`**. Profile photo upload is `POST /author-profile/me/photo` with multipart field **`photo`**.
- Review calls require `{ decision, remarks }`; remarks are mandatory for both HOD and ORIC review.
- An HOD approval persists `sent_to_oric` immediately—no observable `hod_approved` UI state is shown.
- The real RBAC middleware restricts publication creation to faculty/MS/PhD roles. Although HOD accounts can review department publications, they are not offered a “New publication” button because `requireAuthor` excludes the `hod` role.
- The HOD moderation analytics route is ORIC-admin protected in the source. The HOD queue is therefore driven by the source-authorized scoped `GET /publications?status=submitted_to_hod` request.

## Included areas

- Public verified-publication search, debounced autocomplete, filters, advanced search, and pagination.
- Registration, verification-pending, email verification, pending approval, sign-in, password-reset request, and reset-password flows.
- Role-aware dashboards and navigation.
- Publication drafts, edit metadata, external co-authors, PDF scan/upload state, status path, review controls, audit trail, download, citation graph data, and ORIC deletion/correction controls.
- HOD/ORIC review queues, required-review-remarks forms, user approval, department CRUD/HOD assignment, and analytics.
- Researcher profile, prevalidated profile-photo upload/delete, metrics, collaborator data, and public researcher-profile route.
- Shared loading, empty, error, status, and pagination components. HTTP 422 `details` are mapped to React Hook Form fields in the principal server-validated forms; 403 and 429 have specific messages.

## Build check

```bash
npm run build
```

The production build completes successfully.
