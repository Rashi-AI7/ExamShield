# ExamShield — Full Documentation

## Table of Contents

1. [Architecture](#1-architecture)
2. [Setup & Installation](#2-setup--installation)
3. [Environment Variables](#3-environment-variables)
4. [First-Time Setup](#4-first-time-setup)
5. [Seeding the Question Bank](#5-seeding-the-question-bank)
6. [User Roles](#6-user-roles)
7. [Full API Reference](#7-full-api-reference)
8. [The Exam Flow](#8-the-exam-flow)
9. [Paper Assembly](#9-paper-assembly)
10. [Anomaly Detection](#10-anomaly-detection)
11. [Transparency Layer](#11-transparency-layer)
12. [Audit Logging](#12-audit-logging)
13. [Frontend Pages](#13-frontend-pages)
14. [Data Models](#14-data-models)
15. [Deployment](#15-deployment)
16. [Security Notes](#16-security-notes)

---

## 1. Architecture

ExamShield is a monorepo with a Node.js/Express backend and a React/Vite frontend.

```
Browser (React)
     │
     │  HTTP/JSON over /api/*
     ▼
Express Server (Node.js)
     │
     ├── JWT middleware (authenticate + authorize)
     ├── Audit logger middleware (every request logged)
     │
     ├── /api/auth        → registration, login, OTP
     ├── /api/paper       → paper generation, delivery, submission
     ├── /api/admin       → roster, audit log, user management
     ├── /api/review      → coordinator flag review
     ├── /api/questions   → question bank browser
     └── /api/transparency → public paper verification (no auth)
          │
          ▼
     MongoDB Atlas
          │
          ├── users        → accounts (admin / coordinator / student)
          ├── rosters      → candidate registration + exam code tracking
          ├── questions    → 936-question bank (Physics, Chemistry, Biology)
          ├── papers       → assembled exams + submissions + scores
          └── otps         → time-limited OTP tokens (TTL index, auto-deleted)
```

**Key design decisions:**

- Correct answers are never sent to the client — stripped server-side before delivery
- Paper assembly happens entirely on the server — no question IDs are predictable
- Each paper gets a SHA-256 hash at generation time — immutable fingerprint
- OTPs have a MongoDB TTL index and expire automatically after 10 minutes
- The transparency endpoint is intentionally public — no auth, no PII, just verifiable facts

---

## 2. Setup & Installation

### Prerequisites

- Node.js v18 or higher
- npm v9 or higher
- A MongoDB Atlas account (free M0 cluster works)
- A Google Gemini API key ([get one free](https://aistudio.google.com))
- A Gmail account with a 16-character App Password ([how to create one](https://support.google.com/accounts/answer/185833))

### Clone and install

```bash
git clone https://github.com/Rashi-AI7/ExamShield.git
cd ExamShield

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### Run in development

```bash
# Terminal 1 — backend (runs on port 3000)
node server.js

# Terminal 2 — frontend (runs on port 5173)
cd client
npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:3000` automatically.

---

## 3. Environment Variables

Copy `env.example` to `.env`:

```bash
cp env.example .env
```

Then fill in each value:

| Variable | Description | Example |
|---|---|---|
| `MONGO_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/examshield` |
| `GEMINI_API_KEY` | Google Gemini API key for question generation | `AIza...` |
| `JWT_SECRET` | Secret for signing JWTs — any long random string | `my_very_long_random_secret_string_here` |
| `JWT_EXPIRES_IN` | JWT expiry duration | `8h` |
| `GMAIL_USER` | Gmail address for sending OTP and exam code emails | `your@gmail.com` |
| `GMAIL_APP_PASS` | 16-character Gmail App Password (not your login password) | `abcd efgh ijkl mnop` |
| `PORT` | Backend port | `3000` |
| `SEED_EMAIL` | Email of your admin account (used by seed.js to log in) | `admin@example.com` |
| `SEED_PASSWORD` | Password of your admin account | `your_admin_password` |

**Never commit `.env` to git.** It is listed in `.gitignore`.

---

## 4. First-Time Setup

### Step 1 — Bootstrap the admin account

The first registration on a fresh database automatically becomes the admin — no OTP required.

```bash
curl -X POST http://localhost:3000/api/auth/register/init \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Name","email":"your@email.com","password":"yourpassword"}'
```

Response will include `"bootstrap": true` and a JWT token. Save the token.

### Step 2 — Verify the server is running

```bash
curl http://localhost:3000/
# Expected: {"status":"ExamShield is alive","version":"1.0.0","message":"NTA is scared."}
```

### Step 3 — Seed the question bank

See [Section 5](#5-seeding-the-question-bank).

---

## 5. Seeding the Question Bank

ExamShield needs 936 questions to fill all syllabus slots (18 Physics + 16 Chemistry + 18 Biology topics, each with Easy/Medium/Hard difficulties, 6 questions each).

Questions are AI-generated via Google Gemini. The free tier allows 500 requests/day.

### Run the seed script

```bash
node seed.js --limit 100
```

- `--limit N` — generate at most N questions this run (default: unlimited)
- The script will prompt for an OTP in the terminal (sent to `SEED_EMAIL`)
- Progress is saved to `seed-progress.json` — safe to stop and resume anytime
- When all 936 slots are filled, `seed-progress.json` is deleted automatically

### How long does seeding take?

At 4 seconds per question and 500 requests/day (Gemini free tier):

- 100 questions/day = ~10 days to complete
- 500 questions/day = ~2 days to complete

Each run takes about 7 minutes for 100 questions.

### Question types generated

Each topic gets questions of these types in rotation:
`conceptual` · `numerical` · `assertion-reason` · `application` · `comparison`

### NEET Syllabus covered

**Physics (18 topics):** Electrostatics, Current Electricity, Magnetic Effects, Electromagnetic Induction, Electromagnetic Waves, Ray Optics, Wave Optics, Dual Nature of Radiation, Atoms & Nuclei, Semiconductor Electronics, Laws of Motion, Work Energy Power, Gravitation, Properties of Matter, Thermodynamics, Kinetic Theory, Oscillations, Waves

**Chemistry (16 topics):** Some Basic Concepts, Structure of Atom, Chemical Bonding, Equilibrium, Redox Reactions, Hydrogen & s-Block, p-Block Elements, d & f Block Elements, Coordination Compounds, Organic Chemistry Basic Principles, Hydrocarbons, Haloalkanes & Haloarenes, Alcohols Phenols Ethers, Aldehydes Ketones Acids, Amines, Polymers

**Biology (18 topics):** Cell Structure, Cell Division, Biomolecules, Plant Physiology - Photosynthesis, Plant Physiology - Respiration, Plant Growth, Human Digestion, Human Circulation, Human Respiration, Human Excretion, Human Nervous System, Human Endocrine System, Human Reproduction, Genetics - Mendelian, Genetics - Molecular, Evolution, Human Health & Disease, Biotechnology

---

## 6. User Roles

| Role | Created by | Access |
|---|---|---|
| `admin` | Bootstrap (first registration) or manually by another admin | Everything |
| `coordinator` | Admin creates via user management | Dashboard, Review, Roster (view), Question Bank, Generate codes |
| `student` | Self-registers via `/register` page | Exam, Result |

### Role-based route protection

| Route | Roles allowed |
|---|---|
| `/exam` | student |
| `/result` | student |
| `/dashboard` | coordinator, admin |
| `/review` | coordinator, admin |
| `/generate` | coordinator, admin |
| `/bank` | coordinator, admin |
| `/admin/roster` | admin |
| `/admin/users` | admin |
| `/admin/audit` | admin |
| `/verify` | public (no login) |

---

## 7. Full API Reference

All routes are prefixed with `/api`. JWT token goes in the `Authorization: Bearer <token>` header.

---

### Auth Routes `/api/auth`

#### `POST /api/auth/register/init`
Start registration. Sends OTP to email.

**Body:**
```json
{
  "name": "Student Name",
  "email": "student@example.com",
  "password": "securepassword",
  "governmentId": "234123412346"
}
```

- `governmentId` — 12-digit Aadhaar number. Validated using Verhoeff checksum algorithm.
- First-ever registration on a fresh DB skips OTP and returns a bootstrap admin token.

**Response (normal):**
```json
{ "success": true, "message": "OTP sent to student@example.com" }
```

**Response (bootstrap):**
```json
{ "success": true, "bootstrap": true, "token": "...", "user": { "role": "admin" } }
```

---

#### `POST /api/auth/register/verify`
Verify OTP and create account.

**Body:**
```json
{ "email": "student@example.com", "otp": "123456" }
```

**Response:**
```json
{
  "success": true,
  "token": "eyJ...",
  "user": { "_id": "...", "name": "Student Name", "role": "student" }
}
```

Also creates a `Roster` document for the student with an auto-generated roll number (`NEET26000001`, `NEET26000002`, etc.)

---

#### `POST /api/auth/login/init`
Start login. For students: returns token immediately (no OTP). For admin/coordinator: sends OTP.

**Body:**
```json
{ "email": "user@example.com", "password": "password" }
```

**Response (student):**
```json
{ "success": true, "otpSkipped": true, "token": "eyJ...", "user": { "role": "student" } }
```

**Response (admin/coordinator):**
```json
{ "success": true, "message": "OTP sent" }
```

---

#### `POST /api/auth/login/verify`
Verify login OTP (admin/coordinator only).

**Body:**
```json
{ "email": "admin@example.com", "otp": "123456" }
```

**Response:**
```json
{ "success": true, "token": "eyJ...", "user": { "role": "admin" } }
```

---

#### `GET /api/auth/me`
Get current user from token.

**Auth:** Required

**Response:**
```json
{ "success": true, "user": { "_id": "...", "name": "...", "role": "..." } }
```

---

### Paper Routes `/api/paper`

#### `POST /api/paper/generate`
Redeem an exam code and assemble a unique paper.

**Auth:** Student only

**Body:**
```json
{ "examCode": "ME2X5PH8" }
```

**Validations:**
- Code must exist and belong to this student's roster entry
- Code must not have been used before
- Current time must be within `windowStart` and `windowEnd`
- Student must not have an active paper already

**Response:**
```json
{
  "success": true,
  "message": "Unique paper assembled",
  "paperId": "6a36215b6b2a32f2e9184fcb",
  "accessToken": "77bbc04d...",
  "paperHash": "256429f4...",
  "subject": "NEET",
  "totalQuestions": 48,
  "sectionBreakdown": {
    "Physics": 14,
    "Chemistry": 14,
    "Botany": 10,
    "Zoology": 10
  },
  "difficultyBreakdown": {
    "Easy": 14,
    "Medium": 20,
    "Hard": 14
  }
}
```

The exam code is burned (marked used) immediately.

---

#### `GET /api/paper/:paperId?accessToken=<token>`
Fetch the assembled paper. Correct answers are stripped before delivery.

**Auth:** Student (own paper) or coordinator/admin

**Response:**
```json
{
  "success": true,
  "paper": {
    "_id": "...",
    "status": "active",
    "questions": [
      {
        "questionId": "...",
        "subject": "Physics",
        "topic": "Electrostatics",
        "difficulty": "Easy",
        "variant": {
          "questionText": "...",
          "options": { "A": "...", "B": "...", "C": "...", "D": "..." }
        }
      }
    ]
  }
}
```

Note: `variant.correctAnswer` is never included in this response.

---

#### `POST /api/paper/submit`
Submit responses and receive score.

**Auth:** Student only

**Body:**
```json
{
  "paperId": "6a36215b6b2a32f2e9184fcb",
  "accessToken": "77bbc04d...",
  "totalTimeSeconds": 3600,
  "responses": [
    {
      "questionId": "...",
      "selectedOption": "A",
      "timeSpentSeconds": 120,
      "changesCount": 1,
      "finalChangeSecondsBefore": 30
    }
  ]
}
```

- `selectedOption` — `"A"`, `"B"`, `"C"`, `"D"`, or `null` (unattempted)
- `changesCount` — how many times the answer was changed (used by anomaly detector)
- `finalChangeSecondsBefore` — seconds before end of exam when last change was made

**Scoring:** +4 for correct, -1 for incorrect, 0 for unattempted

**Response:**
```json
{
  "success": true,
  "paperId": "...",
  "paperHash": "256429f4...",
  "status": "submitted",
  "score": {
    "correct": 12,
    "incorrect": 8,
    "unattempted": 28,
    "marks": 40,
    "total": 48
  },
  "flagged": false,
  "message": "Submission received successfully."
}
```

If anomalies are detected, `status` will be `"flagged"` and `flagged` will be `true`. The student still sees their score — flagging is not punishment.

---

### Admin Routes `/api/admin`

#### `POST /api/admin/roster/generate-codes`
Generate and email time-gated exam codes to all registered candidates who don't have one yet.

**Auth:** Admin only

**Body:**
```json
{
  "windowStart": "2026-06-20T00:00:00.000Z",
  "windowEnd": "2026-06-22T23:59:00.000Z"
}
```

Both times are in UTC. Plan accordingly for IST (+5:30).

**Response:**
```json
{
  "success": true,
  "message": "Generated codes for 1 candidates",
  "updated": 1,
  "emailsSent": 1,
  "emailFailures": [],
  "windowStart": "2026-06-20T00:00:00.000Z",
  "windowEnd": "2026-06-22T23:59:00.000Z"
}
```

---

#### `GET /api/admin/roster?page=1&limit=50&filter=issued`
Get paginated roster with stats.

**Auth:** Admin or coordinator

**Query params:**
- `page` — page number (default: 1)
- `limit` — results per page (default: 50)
- `filter` — `issued`, `used`, `none`, or omit for all

**Response:**
```json
{
  "success": true,
  "total": 42,
  "codesIssued": 40,
  "codesUsed": 38,
  "page": 1,
  "pages": 1,
  "entries": [ ... ]
}
```

---

#### `GET /api/admin/audit?lines=100`
Fetch recent audit log entries.

**Auth:** Admin only

**Response:**
```json
{
  "success": true,
  "total": 350,
  "entries": [
    {
      "method": "POST",
      "route": "/api/paper/submit",
      "statusCode": 200,
      "durationMs": 234,
      "ip": "::1",
      "startedAt": "2026-06-20T05:15:07.000Z"
    }
  ]
}
```

---

#### `GET /api/admin/users?role=student`
List all users with optional role filter.

**Auth:** Admin only

---

#### `PATCH /api/admin/users/:id/deactivate`
Deactivate a user account (they can no longer log in).

**Auth:** Admin only

---

#### `PATCH /api/admin/users/:id/reactivate`
Reactivate a deactivated account.

**Auth:** Admin only

---

### Review Routes `/api/review`

#### `GET /api/review/flagged?limit=50`
List flagged papers awaiting review.

**Auth:** Admin or coordinator

**Response:**
```json
{
  "success": true,
  "total": 3,
  "papers": [
    {
      "paperId": "...",
      "studentId": "...",
      "submittedAt": "...",
      "sectionCounts": { "Physics": 14, "Chemistry": 14, "Botany": 10, "Zoology": 10 },
      "flags": [
        {
          "type": "IMPOSSIBLE_TIMING",
          "severity": "HIGH",
          "description": "Paper submitted in 45 seconds — minimum expected is 240 seconds for 48 questions."
        }
      ]
    }
  ]
}
```

---

#### `GET /api/review/flagged/:paperId`
Get full detail of a flagged paper including evidence and score.

**Auth:** Admin or coordinator

---

#### `PATCH /api/review/flagged/:paperId`
Make a decision on a flagged paper.

**Auth:** Admin or coordinator

**Body:**
```json
{
  "decision": "dismiss",
  "note": "Student reported connectivity issue — verified with institution."
}
```

- `decision`: `"dismiss"` (confirms result) or `"escalate"` (sends to admin)
- `note`: Optional. Saved to audit log.

---

### Questions Routes `/api/questions`

#### `GET /api/questions?subject=Physics&topic=Electrostatics&difficulty=Easy&limit=20`
Browse the question bank.

**Auth:** Admin or coordinator

---

### Transparency Routes `/api/transparency`

#### `GET /api/transparency/:paperHash`
Publicly verify any paper by its hash. No authentication required.

**Response:**
```json
{
  "found": true,
  "paperHash": "256429f4...",
  "examName": "NEET",
  "sectionCounts": {
    "Physics": 14,
    "Chemistry": 14,
    "Botany": 10,
    "Zoology": 10
  },
  "status": "submitted",
  "generatedAt": "2026-06-20T05:12:59.853Z",
  "submittedAt": "2026-06-20T05:15:07.510Z",
  "totalQuestions": 48,
  "reviewState": "not_flagged",
  "flagCount": 0,
  "confirmedMarks": 40
}
```

This endpoint intentionally omits: student name, email, question content, correct answers, answer choices. It only confirms that a paper with this hash was processed honestly and what the outcome was.

---

## 8. The Exam Flow

Complete sequence from registration to result:

```
1. Student hits /register
   → Fills name, email, password, Aadhaar number
   → Backend validates Aadhaar (Verhoeff checksum)
   → OTP sent to email
   → Student enters OTP
   → Account created, Roster entry created, JWT returned
   → Redirected to /generate (exam code entry page)

2. Admin hits /admin/roster
   → Sets exam window (start + end datetime)
   → Clicks "Generate codes for all registered candidates"
   → Backend generates unique 8-char alphanumeric code per candidate
     (chars: A-Z, 2-9 — no 0, O, 1, I, L to avoid visual confusion)
   → Email sent to each candidate with their code

3. Student logs in on exam day
   → POST /api/auth/login/init → token returned immediately (no OTP)
   → Hits /generate page, enters 8-char code
   → Backend validates: code matches, within window, not used, no active paper
   → Paper assembled: 14 Physics + 14 Chemistry + 10 Botany + 10 Zoology
     (randomly sampled from bank, balanced by difficulty)
   → SHA-256 paperHash computed and stored
   → Code burned (examCodeUsed: true)
   → paperId + accessToken + paperHash returned

4. Student takes exam at /exam
   → Questions fetched (correct answers stripped)
   → Timer counts down (3 hours for NEET)
   → Student answers, navigates section grid
   → Submits (manually or auto-submit on timer expiry)

5. Submission processed
   → Responses scored against correct answers (stored in DB, never sent to client)
   → Anomaly detector runs on timing + pattern data
   → Paper status set to "submitted" or "flagged"
   → Result returned to student with score + paperHash

6. Result page at /result
   → Shows score breakdown
   → Shows full paperHash with copy button
   → "Anyone can verify this at /verify/<hash>"

7. Public verification at /verify/<hash>
   → No login required
   → Shows: section counts, timestamps, review state, confirmed marks
   → A journalist, parent, or regulator can verify any result independently
```

---

## 9. Paper Assembly

Paper assembly is the core of ExamShield's anti-leak design.

**Section targets:**
```
Physics:   14 questions
Chemistry: 14 questions
Botany:    10 questions
Zoology:   10 questions
Total:     48 questions
```

**Algorithm:**
1. For each section, query the question bank filtered by subject
2. Sample randomly — no ordering by topic or difficulty
3. Apply difficulty balancing (approximately 30% Easy, 40% Medium, 30% Hard)
4. Assign each question a random variant (each question has multiple variants stored)
5. Compute SHA-256 hash of the paper structure (question IDs + variants + student ID + timestamp)
6. Store the complete paper including correct answers in MongoDB
7. Return paper to client with correct answers stripped

Because questions are sampled randomly and variants are randomized, no two students receive the same paper. A leaked paper from one student is useless to another.

---

## 10. Anomaly Detection

The anomaly detector runs after every submission. It is advisory only — it never changes a student's score or blocks a result.

### Flags

**`IMPOSSIBLE_TIMING` (HIGH severity)**
Triggered when total submission time is less than a minimum threshold based on question count. Even clicking through all 48 questions without reading takes time — submissions below this floor are physically impossible.

**`LAST_SECOND_CHANGES` (MEDIUM severity)**
Triggered when an unusual proportion of answer changes occurred in the final few seconds of the exam. Pattern consistent with a student receiving answers externally during the exam.

**`IDENTICAL_ANSWER_PATTERN` (HIGH severity)**
Triggered when a student's response pattern matches another student's pattern exactly, including on unattempted questions. Since no two papers have the same questions, this would require coordination.

### What happens when flagged

1. Paper status changes from `submitted` to `flagged`
2. Student still sees their score on the result page (flagging is not punishment)
3. Paper appears in coordinator's review queue at `/review`
4. Coordinator reviews evidence, adds a note, and either:
   - **Dismisses** — result confirmed, marks released
   - **Escalates** — sent to admin for further review
5. All decisions are logged in the audit trail

---

## 11. Transparency Layer

The transparency endpoint is the key accountability feature of ExamShield.

**How it works:**

When a paper is assembled, a SHA-256 hash is computed from:
- The list of question IDs in order
- The variant assigned to each question
- The student's user ID
- The assembly timestamp

This hash is stored in MongoDB and given to the student at the end of their exam.

Anyone — the student, a parent, a journalist, a regulator — can visit:
```
https://your-deployment.com/verify/<paperHash>
```

And receive confirmation that:
- A paper with this exact hash was generated at this time
- It contained this many questions across these sections
- It was submitted at this time
- Its current review state is X
- The confirmed marks are Y

**What is NOT revealed:**
- Student name or contact details
- Question content
- Correct answers
- Individual response choices

This allows complete result verification without compromising question bank security or student privacy.

---

## 12. Audit Logging

Every API request is logged by the `auditLogger` middleware, stored in `logs/audit.log`.

Each entry contains:
```json
{
  "method": "POST",
  "route": "/api/paper/submit",
  "statusCode": 200,
  "durationMs": 234,
  "ip": "::1",
  "userId": "6a36215b6b2a32f2e9184fcb",
  "userRole": "student",
  "startedAt": "2026-06-20T05:15:07.000Z",
  "body": { ... }
}
```

**What is never logged:**
- Passwords
- OTP values
- JWT tokens
- Aadhaar numbers

The audit log is viewable by admins at `/admin/audit` in the frontend.

---

## 13. Frontend Pages

| Route | Component | Role | Description |
|---|---|---|---|
| `/login` | Login.jsx | Public | Two-step login (OTP for admin/coordinator, direct for student) |
| `/register` | Register.jsx | Public | Student self-registration with Aadhaar |
| `/verify/:hash` | Transparency.jsx | Public | Paper hash verification |
| `/generate` | Generate.jsx | Student | Enter exam code to start exam |
| `/exam` | Exam.jsx | Student | Exam interface with timer and section navigation |
| `/result` | Result.jsx | Student | Score + paper hash |
| `/dashboard` | Dashboard.jsx | Coord/Admin | Overview: flagged count, question bank size, recent flags |
| `/review` | Review.jsx | Coord/Admin | Flagged paper review with dismiss/escalate |
| `/bank` | Bank.jsx | Coord/Admin | Browse question bank |
| `/admin/roster` | AdminRoster.jsx | Admin | Candidate list, code generation |
| `/admin/users` | AdminUsers.jsx | Admin | User management, deactivate/reactivate |
| `/admin/audit` | AdminAudit.jsx | Admin | Live audit log viewer |

---

## 14. Data Models

### User
```
_id, name, email, password (bcrypt), role (admin|coordinator|student),
isActive, createdAt, updatedAt
```

### Roster
```
_id, name, email, idType, governmentId (Aadhaar),
rollNumber (auto: NEET26000001...), claimed, claimedBy (→ User),
claimedAt, examCode, examCodeWindowStart, examCodeWindowEnd,
examCodeUsed, examCodeUsedAt, examCodeUsedFromIp,
createdAt, updatedAt
```

### Question
```
_id, subject (Physics|Chemistry|Biology), topic, subtopic,
difficulty (Easy|Medium|Hard), type (conceptual|numerical|...),
variants: [{ questionText, options: {A,B,C,D}, correctAnswer, explanation }],
createdAt
```

### Paper
```
_id, student (→ User), paperHash (SHA-256), subject (NEET),
questions: [{
  questionId (→ Question), subject, topic, difficulty,
  variantIndex, variant: { questionText, options, correctAnswer }
}],
responses: [{
  questionId, selectedOption, timeSpentSeconds,
  changesCount, finalChangeSecondsBefore, isCorrect
}],
score: { correct, incorrect, unattempted, marks, total },
status (active|submitted|flagged),
anomalyFlags: [{ type, severity, description, evidence }],
totalTimeSeconds, generatedAt, submittedAt, accessToken
```

### OTP
```
_id, email, otp (6-digit), purpose (registration|login),
expiresAt (TTL index — auto-deleted after 10 minutes)
```

---

## 15. Deployment

### Backend — Railway or Render

1. Push to GitHub
2. Create a new project on [Railway](https://railway.app) or [Render](https://render.com)
3. Connect your GitHub repo
4. Set all environment variables from Section 3
5. Set start command: `node server.js`
6. Deploy

### Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) and import the repo
2. Set root directory to `client`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variable: `VITE_API_URL=https://your-backend-url.railway.app`
6. Update `client/vite.config.js` proxy to point to your production backend URL

### MongoDB — Already cloud-hosted

Atlas is already cloud-hosted. Just ensure your deployment platform's IP is whitelisted in Atlas → Network Access (or set `0.0.0.0/0` for all IPs during testing).

---

## 16. Security Notes

- **Correct answers never reach the browser.** They are stripped in `stripCorrectAnswers()` before the paper response is sent.
- **Access tokens are one-time.** The `accessToken` for fetching a paper is tied to that paper's `_id` and verified on every request.
- **Exam codes are burned on use.** Once redeemed, `examCodeUsed: true` — cannot be reused.
- **JWTs expire in 8 hours.** Students need to complete their exam in one session.
- **OTPs expire in 10 minutes.** MongoDB TTL index handles cleanup automatically.
- **Passwords are bcrypt hashed** with 12 salt rounds.
- **Aadhaar numbers are stored as-is.** In a production deployment, consider encrypting them at rest.
- **The audit log never contains** passwords, OTPs, tokens, or Aadhaar numbers.
- **`.env` is gitignored.** Never commit credentials.

---

*ExamShield — AI flagged. Human reviewed. System executed.*
