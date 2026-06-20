const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Question = require("../models/Question");
const Paper = require("../models/Paper");
const Roster = require("../models/Roster");
const { analyzeSubmission } = require("../services/anomalyDetector");
const { authenticate, authorize } = require("../middleware/auth");

// ── Unified paper blueprint ───────────────────────────────────────────────────
// NEET is ONE exam with FOUR sections (Physics, Chemistry, Botany, Zoology),
// 45 questions each = 180 total, one 3-hour timer, one submission. It is NOT
// four separate exams a candidate picks one of — that was an earlier, wrong
// assumption in this codebase (roster used to have a per-subject examSubject
// field; see Roster.js history). A candidate sits ONE paper covering all four.
//
// SECTION_TARGET_COUNTS is intentionally smaller than real NEET's 45-per-section
// right now — the question bank doesn't yet hold enough seeded questions per
// section to guarantee paper uniqueness at full scale. Structure matches real
// NEET exactly; only the per-section count is scaled down for early launches.
// Raise these numbers as seeding continues — no other code needs to change.
const SECTION_TARGET_COUNTS = {
  Physics:   { Easy: 4, Medium: 6, Hard: 4 },   // 14 of real 45
  Chemistry: { Easy: 4, Medium: 6, Hard: 4 },   // 14 of real 45
  Botany:    { Easy: 3, Medium: 4, Hard: 3 },   // 10 of real 45
  Zoology:   { Easy: 3, Medium: 4, Hard: 3 },   // 10 of real 45
};

// The question bank's Question.js schema only tags subject as Physics /
// Chemistry / Biology — there's no Botany/Zoology split in the schema, and
// re-tagging the whole existing seeded bank right before launch is too risky.
// Instead, Biology questions are classified into Botany or Zoology by topic
// name at assembly time. Topics not in either list are genuinely ambiguous
// in real biology too (Genetics, Ecology, Evolution, Biotechnology, Cell
// Biology apply to both) — these fall back to whichever section still needs
// questions, so assembly doesn't fail just because a topic wasn't pre-sorted.
const BOTANY_TOPICS = [
  "Plant Physiology", "Reproduction in Plants", "Plant Kingdom",
];
const ZOOLOGY_TOPICS = [
  "Human Physiology - Digestion", "Human Physiology - Circulation",
  "Human Physiology - Excretion", "Reproduction in Animals", "Animal Kingdom",
];

const assembleSection = async (questionSubject, topicFilter, difficulty, count) => {
  const match = { subject: questionSubject, difficulty, approvedByAI: true, isActive: true };
  if (topicFilter) match.topic = { $in: topicFilter };

  let questions = await Question.aggregate([{ $match: match }, { $sample: { size: count } }]);

  // Ambiguous-topic fallback: if the strict topic filter didn't yield enough
  // (either because the topic genuinely applies to both kingdoms, or because
  // not enough of this exact topic has been seeded yet), widen to any
  // question of this subject+difficulty not already pulled, rather than
  // failing the whole paper over a sorting gap.
  if (topicFilter && questions.length < count) {
    const have = questions.map((q) => q._id);
    const extra = await Question.aggregate([
      { $match: { subject: questionSubject, difficulty, approvedByAI: true, isActive: true, _id: { $nin: have } } },
      { $sample: { size: count - questions.length } },
    ]);
    questions = questions.concat(extra);
  }
  return questions;
};

const assemblePaper = async () => {
  const selected = [];

  const tagSection = (q, section) => {
    const vi = Math.floor(Math.random() * q.variants.length);
    selected.push({
      questionId: q._id,
      subject: section, // section label (Physics/Chemistry/Botany/Zoology), not the raw DB subject
      topic: q.topic,
      difficulty: q.difficulty,
      variant: q.variants[vi],
    });
  };

  // Looped section-first, difficulty-second so the final `selected` array is
  // contiguous by section (all Physics together, then all Chemistry, etc.) —
  // matching how NEET actually presents a paper. An earlier version looped
  // difficulty-first, which interleaved sections within each difficulty tier
  // and broke any UI that groups/labels questions by section.
  for (const subject of ["Physics", "Chemistry"]) {
    for (const difficulty of ["Easy", "Medium", "Hard"]) {
      const count = SECTION_TARGET_COUNTS[subject][difficulty];
      const qs = await assembleSection(subject, null, difficulty, count);
      if (qs.length < count)
        throw new Error(`Not enough ${difficulty} ${subject} questions. Need ${count}, have ${qs.length}`);
      qs.forEach((q) => tagSection(q, subject));
    }
  }

  // Botany and Zoology both draw from the same "Biology" DB subject, split
  // by topic. Collected into two flat arrays across all three difficulties
  // first, then tagged in two clean passes — keeps each section contiguous
  // in the final paper without needing any reordering trick afterward.
  const botanyAll = [];
  const zoologyAll = [];
  for (const difficulty of ["Easy", "Medium", "Hard"]) {
    const botany = await assembleSection("Biology", BOTANY_TOPICS, difficulty, SECTION_TARGET_COUNTS.Botany[difficulty]);
    const zoologyExclude = botany.map((q) => q._id);
    const zoology = await assembleSection("Biology", ZOOLOGY_TOPICS, difficulty, SECTION_TARGET_COUNTS.Zoology[difficulty]);
    const zoologyFiltered = zoology.filter((q) => !zoologyExclude.some((id) => id.equals(q._id)));
    const totalBio = botany.length + zoologyFiltered.length;
    const neededBio = SECTION_TARGET_COUNTS.Botany[difficulty] + SECTION_TARGET_COUNTS.Zoology[difficulty];
    if (totalBio < neededBio)
      throw new Error(`Not enough ${difficulty} Biology questions for Botany+Zoology. Need ${neededBio}, have ${totalBio}`);
    botanyAll.push(...botany);
    zoologyAll.push(...zoologyFiltered);
  }
  botanyAll.forEach((q) => tagSection(q, "Botany"));
  zoologyAll.forEach((q) => tagSection(q, "Zoology"));

  return selected;
};

// Strips correctAnswer from all questions before sending to client.
const stripCorrectAnswers = (paper) => {
  const obj = paper.toObject ? paper.toObject() : { ...paper };
  obj.questions = obj.questions.map((q) => {
    const { correctAnswer, ...safeVariant } = q.variant;
    return { ...q, variant: safeVariant };
  });
  return obj;
};

// Verify paper access token — student must own this paper AND supply the right token.
const verifyPaperAccess = (paper, user, accessToken) => {
  if (paper.studentId.toString() !== user.id.toString()) return "Access denied";
  if (paper.accessToken !== accessToken) return "Invalid access token";
  return null;
};

// POST /api/paper/generate — student only
router.post("/generate", authenticate, authorize("student"), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { examCode } = req.body;

    // Confirm this candidate has a valid roster entry (created at registration).
    // There's no subject to assign anymore — one exam, one paper, four
    // sections inside it — this just confirms they're a registered candidate.
    const rosterEntry = await Roster.findOne({ claimedBy: studentId });
    if (!rosterEntry)
      return res.status(403).json({ error: "No roster entry found for this account — contact your coordinator" });

    // ── Exam Access Code gate ─────────────────────────────────────────────
    // This replaces OTP as the exam-day check. Real exam centers ban
    // personal devices, so a code the student already has (printed, or
    // shown earlier while still on their own device) is the only thing
    // that can realistically be entered on a locked-down center machine.
    if (!examCode)
      return res.status(400).json({ error: "Exam access code is required" });
    if (!rosterEntry.examCode)
      return res.status(403).json({ error: "No exam code has been issued for this roster entry yet — contact your coordinator" });
    if (rosterEntry.examCodeUsed)
      return res.status(409).json({ error: "This exam code has already been used" });

    const now = new Date();
    if (now < rosterEntry.examCodeWindowStart)
      return res.status(403).json({ error: `Too early — this code is valid from ${rosterEntry.examCodeWindowStart.toLocaleString()}` });
    if (now > rosterEntry.examCodeWindowEnd)
      return res.status(403).json({ error: "This code's exam window has closed — contact your coordinator" });

    // Case-insensitive compare — students may retype a code shown in mixed
    // case, and the code alphabet has no case-sensitive meaning anyway.
    if (examCode.trim().toUpperCase() !== rosterEntry.examCode)
      return res.status(403).json({ error: "Incorrect exam access code" });

    // Code is validated here but deliberately NOT burned yet — if paper
    // assembly fails below (e.g. question bank shortage), the student must
    // not lose their one-time code to a system error that wasn't their fault.
    // It's burned only after the paper is actually created successfully.

    // One exam per candidate — no subject parameter, since there's only one
    // exam to generate, not a choice of which subject's paper to start.
    const existing = await Paper.findOne({ studentId, status: "active" });
    if (existing)
      return res.status(400).json({ error: "You already have an active exam in progress" });

    const questions = await assemblePaper();

    const paperHash = crypto
      .createHash("sha256")
      .update(`${studentId}-NEET-${Date.now()}-${JSON.stringify(questions)}`)
      .digest("hex");

    // 32-byte random token — required for all subsequent paper operations
    const accessToken = crypto.randomBytes(32).toString("hex");

    const paper = await Paper.create({
      studentId,
      subject: "NEET", // constant — one exam, four sections inside questions[]; see Paper.js
      questions,
      paperHash,
      accessToken,
      status: "active",
      generatedAt: new Date(),
    });

    // Burn the code now that the paper genuinely exists — at most one
    // session can ever start from this code. IP captured for the record
    // even though not enforced yet (v2 — not every center has a fixed
    // network range to bind against).
    rosterEntry.examCodeUsed = true;
    rosterEntry.examCodeUsedAt = now;
    rosterEntry.examCodeUsedFromIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    await rosterEntry.save();

    res.status(201).json({
      success: true,
      message: "Unique paper assembled",
      paperId: paper._id,
      // accessToken given to student exactly once — they must store it
      accessToken: paper.accessToken,
      paperHash: paper.paperHash,
      subject: paper.subject,
      totalQuestions: questions.length,
      sectionBreakdown: {
        Physics: questions.filter((q) => q.subject === "Physics").length,
        Chemistry: questions.filter((q) => q.subject === "Chemistry").length,
        Botany: questions.filter((q) => q.subject === "Botany").length,
        Zoology: questions.filter((q) => q.subject === "Zoology").length,
      },
      difficultyBreakdown: {
        Easy: questions.filter((q) => q.difficulty === "Easy").length,
        Medium: questions.filter((q) => q.difficulty === "Medium").length,
        Hard: questions.filter((q) => q.difficulty === "Hard").length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/paper/:paperId?accessToken=xxx — student (own paper) + coordinator/admin
router.get("/:paperId", authenticate, async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.paperId);
    if (!paper) return res.status(404).json({ error: "Paper not found" });

    if (req.user.role === "student") {
      const err = verifyPaperAccess(paper, req.user, req.query.accessToken);
      if (err) return res.status(403).json({ error: err });
    }

    res.json({ success: true, paper: stripCorrectAnswers(paper) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/paper/submit — student only, access token required
router.post("/submit", authenticate, authorize("student"), async (req, res) => {
  try {
    const { paperId, accessToken, responses, totalTimeSeconds } = req.body;

    if (!paperId || !accessToken || !responses || !Array.isArray(responses))
      return res.status(400).json({ error: "paperId, accessToken, and responses array required" });

    const paper = await Paper.findById(paperId);
    if (!paper) return res.status(404).json({ error: "Paper not found" });

    const accessErr = verifyPaperAccess(paper, req.user, accessToken);
    if (accessErr) return res.status(403).json({ error: accessErr });

    if (paper.status !== "active")
      return res.status(400).json({ error: `Paper already ${paper.status}` });

    // Score
    let correct = 0, incorrect = 0, unattempted = 0;
    for (const question of paper.questions) {
      const r = responses.find((r) => r.questionId === question.questionId.toString());
      if (!r || !r.selectedOption) {
        unattempted++;
        question.response = { selectedOption: null, isCorrect: null, timeSpentSeconds: r?.timeSpentSeconds || null, changesCount: 0, finalChangeSecondsBefore: null };
      } else {
        const isCorrect = r.selectedOption === question.variant.correctAnswer;
        if (isCorrect) correct++; else incorrect++;
        question.response = { selectedOption: r.selectedOption, isCorrect, timeSpentSeconds: r.timeSpentSeconds || null, changesCount: r.changesCount || 0, finalChangeSecondsBefore: r.finalChangeSecondsBefore || null };
      }
    }

    const marks = correct * 4 - incorrect;
    paper.totalTimeSeconds = totalTimeSeconds || null;

    // Anomaly detection — constitution: failure must never crash submit
    let anomalyFlags = [];
    try {
      anomalyFlags = await analyzeSubmission(paper, responses);
    } catch (e) {
      console.error("[AnomalyDetector] Failed silently:", e.message);
    }

    paper.status = anomalyFlags.length > 0 ? "flagged" : "submitted";
    paper.submittedAt = new Date();
    paper.score = { correct, incorrect, unattempted, marks };
    paper.anomalyFlags = anomalyFlags;

    // Invalidate access token on submit — paper can't be fetched again with old token
    paper.accessToken = crypto.randomBytes(32).toString("hex");

    await paper.save();

    res.json({
      success: true,
      paperId: paper._id,
      paperHash: paper.paperHash,
      status: paper.status,
      score: { correct, incorrect, unattempted, marks, total: paper.questions.length },
      flagged: anomalyFlags.length > 0,
      message: anomalyFlags.length > 0
        ? "Your submission is under review. Results will be confirmed shortly."
        : "Submission received successfully.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
