<div align="center">

# ExamShield

### An open-source exam platform built as a direct response to India's NTA/NEET paper leak crisis.

*AI flagged. Human reviewed. System executed.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![JavaScript](https://img.shields.io/badge/JavaScript-82%25-yellow)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen)

</div>

---

## The Problem

In 2024, India's NEET-UG examination — taken by over **2.4 million students** — was compromised by a nationwide paper leak orchestrated via Telegram. Students paid lakhs for leaked papers. Topper lists were fabricated. An entire year of preparation was stolen from millions of honest students.

The NTA's failure wasn't just administrative. It was **architectural**:

| NTA's failure | What it meant |
|---|---|
| One paper for all students | Leak one paper, compromise everyone |
| No tamper-evident delivery | No way to prove what a student actually received |
| No public audit trail | No way for anyone to verify results independently |
| Automated scoring, no human oversight | No accountability layer between system and student |

ExamShield is a direct technical response to every one of those failures.

---

## What ExamShield Does Differently

### 1. No two students get the same paper
Questions are randomly assembled from a 936-question bank at exam time — on the server, not the client. Every student gets a unique combination. Leaking one student's paper is useless to another.

### 2. Correct answers never leave the server
The frontend never receives correct answers — they are stripped server-side before delivery. Even if a student opens DevTools and inspects every network response, there are no answers to find.

### 3. Every result is cryptographically verifiable
At the moment of paper assembly, a SHA-256 hash is computed and given to the student. After submission, **anyone** — a parent, a journalist, a regulator, a court — can hit a public endpoint with that hash and verify:
- When the paper was generated
- How many questions were in each section
- Whether it was flagged for review
- What the confirmed marks are

No login. No bureaucracy. Just a hash and a truth.

### 4. AI detects, humans decide — always
The anomaly detector flags suspicious submissions. It never cancels a result, never blocks a student, never takes any consequential action. A human coordinator reviews the evidence and makes the call. The system waits.

### 5. Full audit trail, nothing hidden
Every API call — every registration, every login, every paper generation, every submission — is logged with timestamp, route, IP address, and status code. Admins can see everything. Nothing is quietly discarded.

---

## On Scale and Budget

NTA has a budget of hundreds of crores, dedicated infrastructure teams, and government backing.

ExamShield was built by **one developer** as a proof of concept and a political statement.

The architecture here addresses the *design failures* that caused the NTA leak — not the scale. Horizontal scaling is an infrastructure problem that money solves. Paper leaks are an integrity problem that money made worse.

ExamShield solves the integrity problem.

Known scale limitations (honest, not hidden) are documented below.

---

## Core Architecture

```
Student registers (Aadhaar format-validated)
        ↓
Admin issues time-gated, single-use exam code
(emailed in advance — like an admit card)
        ↓
Exam day: student enters code at center
→ unique 48-question paper assembled on server
→ SHA-256 paperHash computed and stored
→ code burned immediately
        ↓
Exam runs in browser
→ correct answers never sent to client
→ timer auto-submits on expiry
        ↓
Submission scored server-side
→ anomaly detection runs
→ paper status: submitted or flagged
        ↓
Student receives score + paperHash
→ hash verifiable by anyone, forever, at /verify/<hash>
        ↓
Flagged papers → coordinator review queue
→ human dismisses or escalates
→ system never auto-punishes
```

---

## Features

**For students**
- Self-registration with Aadhaar (Verhoeff checksum validated — no fake numbers)
- OTP email verification at registration; **direct login on exam day** (no OTP — exam centers ban personal devices)
- Time-gated access code — works only inside the exam window, burns on first use
- 48-question NEET paper: Physics (14) · Chemistry (14) · Botany (10) · Zoology (10)
- Circular countdown timer with stale-closure-proof auto-submit
- Paper hash on result page — copy and share as proof of honest processing

**For coordinators / admins**
- Generate and email exam codes to all registered candidates in one click
- Review flagged papers with full evidence — dismiss or escalate, never auto-punish
- Live audit log — every action, timestamped, with IP
- User management — activate/deactivate accounts
- Question bank browser with subject/topic/difficulty filters

**Transparency layer (public, zero login)**
- `GET /api/transparency/:paperHash` — section counts, timestamps, review state, confirmed marks
- `/verify/:hash` — student-shareable link that auto-runs verification
- No student name. No question content. No answer keys. Just verifiable facts.

---

## Anomaly Detection

The detector runs after every submission. It **never** changes a score or blocks a result.

| Flag | Severity | Trigger |
|---|---|---|
| `IMPOSSIBLE_TIMING` | HIGH | Submission faster than humanly possible for 48 questions |
| `LAST_SECOND_CHANGES` | MEDIUM | Statistically improbable answer changes in the final seconds |
| `IDENTICAL_ANSWER_PATTERN` | HIGH | Response pattern — including unattempted questions — matches another submission exactly |

All flags go to the coordinator review queue. **A human decides. The system waits.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express 4 |
| Database | MongoDB Atlas + Mongoose |
| Frontend | React + Vite + CSS Modules |
| AI (question generation) | Google Gemini 2.5 Flash |
| Email | Nodemailer + Gmail |
| Auth | JWT (8h expiry) + bcrypt (12 rounds) + OTP |
| Paper integrity | SHA-256 — Node.js native `crypto` module |
| Identity validation | Verhoeff checksum (offline, no API) |

---

## Question Bank

**936 questions** across the full NEET UG syllabus, AI-generated via Gemini 2.5 Flash:

| Subject | Topics | Questions |
|---|---|---|
| Physics | 18 topics | 324 |
| Chemistry | 16 topics | 288 |
| Biology (Botany + Zoology) | 18 topics | 324 |
| **Total** | **52 topics** | **936** |

Each topic has Easy / Medium / Hard variants across 5 question types:
`conceptual` · `numerical` · `assertion-reason` · `application` · `comparison`

Difficulty is AI-assigned. Real psychometric calibration (based on actual student response data) is a v2 goal.

---

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB Atlas account (free M0 tier works)
- Google Gemini API key ([free at aistudio.google.com](https://aistudio.google.com))
- Gmail account with 16-character App Password ([guide](https://support.google.com/accounts/answer/185833))

### Install

```bash
git clone https://github.com/Rashi-AI7/ExamShield.git
cd ExamShield
npm install
cd client && npm install && cd ..
```

### Configure

```bash
cp env.example .env
```

```env
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/examshield
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=any_long_random_string
JWT_EXPIRES_IN=8h
GMAIL_USER=your@gmail.com
GMAIL_APP_PASS=your_16_char_app_password
PORT=3000
SEED_EMAIL=your_admin_email
SEED_PASSWORD=your_admin_password
```

### Run

```bash
# Terminal 1 — backend (port 3000)
node server.js

# Terminal 2 — frontend (port 5173)
cd client && npm run dev
```

### First-time setup

```bash
# 1. Bootstrap admin (first registration on a fresh DB — no OTP, auto-admin)
curl -X POST http://localhost:3000/api/auth/register/init \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Name","email":"your@email.com","password":"yourpassword"}'

# 2. Seed the question bank (run daily — 936 questions, ~500 API calls)
node seed.js --limit 100
```

Full setup guide → [DOCS.md](./DOCS.md)

---

## API Overview

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register/init` | — | Register with Aadhaar, sends OTP |
| POST | `/api/auth/register/verify` | — | Verify OTP, create account |
| POST | `/api/auth/login/init` | — | Login — direct for students, OTP for admin |
| POST | `/api/auth/login/verify` | — | Verify admin login OTP |
| POST | `/api/paper/generate` | Student | Redeem exam code, assemble unique paper |
| GET | `/api/paper/:paperId` | Student | Fetch questions — correct answers stripped |
| POST | `/api/paper/submit` | Student | Submit responses, receive score |
| GET | `/api/transparency/:hash` | **Public** | Verify any paper by hash — no login |
| POST | `/api/admin/roster/generate-codes` | Admin | Issue time-gated codes to all candidates |
| GET | `/api/admin/roster` | Admin/Coord | View candidate list and code status |
| GET | `/api/admin/audit` | Admin | Live audit log |
| GET | `/api/review/flagged` | Admin/Coord | Flagged papers awaiting human review |
| PATCH | `/api/review/flagged/:id` | Admin/Coord | Dismiss or escalate a flag |

Full API reference with request/response examples → [DOCS.md](./DOCS.md)

---

## Project Structure

```
ExamShield/
├── server.js                   # Express entry point + route mounting
├── seed.js                     # Resumable question bank seeding script
├── env.example                 # Environment variable template
├── src/
│   ├── config/db.js            # MongoDB Atlas connection
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication + role-based authorization
│   │   └── auditLogger.js      # Full request/response audit logging
│   ├── models/
│   │   ├── User.js             # Accounts (admin / coordinator / student)
│   │   ├── Roster.js           # Candidate registration + exam code tracking
│   │   ├── Question.js         # 936-question bank
│   │   ├── Paper.js            # Assembled papers, submissions, scores, flags
│   │   └── OTP.js              # Time-limited OTPs (MongoDB TTL — auto-deleted)
│   ├── routes/
│   │   ├── auth.js             # Registration + login flows
│   │   ├── paper.js            # Paper generation, delivery, submission
│   │   ├── admin.js            # Roster management, audit log, user management
│   │   ├── review.js           # Coordinator flag review
│   │   ├── questions.js        # Question bank browser
│   │   └── transparency.js     # Public paper verification (no auth)
│   ├── services/
│   │   ├── geminiService.js    # Gemini API question generation
│   │   ├── emailService.js     # Nodemailer OTP + exam code delivery
│   │   └── anomalyDetector.js  # Behavioural flag detection (advisory only)
│   └── utils/
│       └── aadhaarValidator.js # Verhoeff checksum — offline Aadhaar validation
└── client/                     # React + Vite frontend
    └── src/
        ├── pages/              # Login, Register, Exam, Result, all Admin pages
        ├── components/         # Sidebar, Timer (stale-closure-proof), ProtectedRoute
        ├── context/            # AuthContext — JWT state management
        └── api/                # Axios client with JWT interceptor
```

---

## Known Limitations at Scale

These are honest, documented limitations — not hidden. ExamShield v1 is a proof of concept. Here is exactly what breaks first when you scale:

**1. Identical-answer-pattern detection loads all submitted papers into memory per submission.**
At v1 volume (hundreds of students) this is fine. At 20,000 concurrent submissions, this becomes a memory and latency problem. Fix: move the comparison to a DB-side aggregation query.

**2. Email dispatch is synchronous and sequential.**
`generate-codes` sends one email at a time, inside the HTTP request. At hundreds of candidates this is slow but acceptable. At thousands, it times out. Fix: Bull + Redis job queue, emails sent async in background workers.

**3. Roll number generation has a race window.**
The system counts existing roll numbers and increments. Under high concurrent registrations, two students could theoretically get the same roll number. Auth.js retries 3 times on collision — acceptable at v1 volume, not bulletproof. Fix: atomic MongoDB counter using `findOneAndUpdate` with `$inc`.

**4. Browser-side security enforcement is not hard lockdown.**
ExamShield enforces tab switch detection, right-click blocking, copy-paste prevention, DevTools keyboard shortcuts, and text selection — with an auto-submit after 3 violations. This is effective against casual attempts. It is not hard lockdown. A determined student can open DevTools before the exam starts, use a second device, use browser extensions that bypass DOM event listeners, or run the browser inside a VM. True lockdown requires a dedicated application (Safe Exam Browser, Respondus, ExamSoft) that controls the OS-level environment — not just the browser tab. ExamShield's browser security is designed for managed exam center machines where students don't have admin rights. It is not designed for home-based exams.

These are infrastructure problems. They are solved by engineering time and server budget. They are not the problem that caused the NTA leak.

---

## Roadmap — v2

These require scale, governmental partnership, or infrastructure beyond a solo deployment:

**Psychometric difficulty calibration**
Current difficulty tags are AI-assigned — Gemini's opinion of what is hard. Real calibration requires actual student response data: per-question correct rates, average time spent, discrimination index. Recalibrate from performance, not AI assumption. *Only possible at scale.*

**Official Aadhaar verification**
Currently validates Aadhaar format using the Verhoeff checksum — confirms the number is structurally valid, not that it belongs to the registrant. Real identity verification requires the UIDAI Aadhaar API. *Requires government partnership.*

**Kiosk / hard lockdown mode**
v1 includes browser-level enforcement — tab switch detection, right-click blocking, copy-paste prevention, auto-submit on violations. v2 requires OS-level lockdown: a dedicated app (Safe Exam Browser or equivalent) that kills all other processes, prevents alt-tab, disables external monitors, and controls the entire machine. *Cannot be built in a browser — requires a native application.*

**Load testing for 20,000 concurrent students**
Paper generation, question fetching, and submission under simultaneous load. Connection pooling, Atlas tier selection, horizontal server scaling. None of this has been tested yet — it needs to be before any real deployment.

**SMS OTP fallback**
Email isn't reliable in low-connectivity exam centers. SMS via MSG91 or AWS SNS as fallback. Adds cost per sitting.

**Bulk student import**
CSV import with batch Aadhaar validation and exam code dispatch — for institutions where self-registration isn't practical.

---

## The Constitution

> *AI flagged. Human reviewed. System executed.*

No automated punishment. No black-box decisions. No student's result cancelled by an algorithm. Every consequential action is taken by a human being, informed by evidence, recorded permanently in an audit log.

This isn't just a design choice. It's a response to what happens when you remove humans from accountability loops.

---

## Contributing

Pull requests are welcome. Open an issue first to discuss what you'd like to change.

If you're working on India's exam reform movement — CJP, student advocacy, institutional accountability — and want to deploy or adapt this, reach out.

---

## License

MIT
