const express = require("express");
const router = express.Router();
const Paper = require("../models/Paper");
const { authenticate, authorize } = require("../middleware/auth");

// All review routes are coordinator + admin only.
// Constitution: correctAnswers are NEVER exposed here.
// Coordinators review behaviour evidence — not answers.
router.use(authenticate, authorize("coordinator", "admin"));

// ── GET /api/review/flagged ───────────────────────────────────────────────────
// List all flagged papers awaiting human review.
// Returns summary only — no question text, no correctAnswers, no full evidence.
// Coordinator uses this to triage which papers to open.

router.get("/flagged", async (req, res) => {
  try {
    const { status = "flagged", severity, page = 1, limit = 20 } = req.query;

    const filter = { status };

    // Optional filter — no subject filter anymore, since every paper is the
    // same single NEET exam (four sections inside one paper), not one of
    // several subject-specific papers.
    if (severity) {
      filter["anomalyFlags.severity"] = severity;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const papers = await Paper.find(filter)
      .select(
        "studentId subject status score anomalyFlags.type anomalyFlags.severity " +
        "anomalyFlags.description anomalyFlags.reviewedByHuman anomalyFlags.flaggedAt " +
        "submittedAt totalTimeSeconds questions.subject"
      )
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Paper.countDocuments(filter);

    // Summary per paper — just enough for triage. sectionCounts replaces a
    // single subject label: NEET is one exam with four sections inside one
    // paper, so "what subject is this paper" isn't a useful question anymore
    // — "how many questions from each section" is.
    const summary = papers.map((p) => {
      const sectionCounts = {};
      for (const q of p.questions || []) {
        sectionCounts[q.subject] = (sectionCounts[q.subject] || 0) + 1;
      }
      return {
        paperId: p._id,
        studentId: p.studentId,
        subject: p.subject,
        sectionCounts,
        submittedAt: p.submittedAt,
        totalTimeSeconds: p.totalTimeSeconds,
        score: p.score,
        flagCount: p.anomalyFlags.length,
        allReviewed: p.anomalyFlags.every((f) => f.reviewedByHuman),
        flags: p.anomalyFlags.map((f) => ({
          type: f.type,
          severity: f.severity,
          description: f.description,
          reviewedByHuman: f.reviewedByHuman,
          flaggedAt: f.flaggedAt,
        })),
      };
    });

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      papers: summary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/review/flagged/:paperId ─────────────────────────────────────────
// Full detail for one flagged paper.
// Includes: all flag evidence, response-by-response timing, question metadata.
// Does NOT include: correctAnswers, question text (coordinator reviews behaviour).

router.get("/flagged/:paperId", async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.paperId).lean();
    if (!paper) return res.status(404).json({ error: "Paper not found" });
    if (paper.status !== "flagged") {
      return res.status(400).json({ error: `Paper status is '${paper.status}', not flagged` });
    }

    // Strip correctAnswer from every question — coordinator sees behaviour, not answers
    const safeQuestions = paper.questions.map((q) => ({
      questionId: q.questionId,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
      // No correctAnswer, no questionText — coordinator doesn't need to mark answers
      response: {
        selectedOption: q.response?.selectedOption ?? null,
        timeSpentSeconds: q.response?.timeSpentSeconds ?? null,
        changesCount: q.response?.changesCount ?? 0,
        finalChangeSecondsBefore: q.response?.finalChangeSecondsBefore ?? null,
      },
    }));

    res.json({
      success: true,
      paper: {
        paperId: paper._id,
        studentId: paper.studentId,
        subject: paper.subject,
        status: paper.status,
        paperHash: paper.paperHash,
        generatedAt: paper.generatedAt,
        submittedAt: paper.submittedAt,
        totalTimeSeconds: paper.totalTimeSeconds,
        score: paper.score,
        anomalyFlags: paper.anomalyFlags, // full evidence — coordinator needs this
        questions: safeQuestions,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/review/flagged/:paperId ───────────────────────────────────────
// Coordinator marks one or all flags as reviewed and records their decision.
// Constitution:
//   - This route NEVER changes a student's score.
//   - It NEVER disqualifies or clears a student.
//   - It only records that a human looked at the evidence.
//   - Score changes and disciplinary action are admin-level actions (v2).

router.patch("/flagged/:paperId", async (req, res) => {
  try {
    const { flagIndex, decision, note } = req.body;
    // flagIndex: which flag to mark (0-based). Omit to mark ALL flags reviewed.
    // decision: "escalate" | "dismiss" — coordinator's call
    // note: free text, stored for audit trail

    if (!decision || !["escalate", "dismiss"].includes(decision)) {
      return res.status(400).json({
        error: "decision is required: 'escalate' or 'dismiss'",
      });
    }

    const paper = await Paper.findById(req.params.paperId);
    if (!paper) return res.status(404).json({ error: "Paper not found" });
    if (paper.status !== "flagged") {
      return res.status(400).json({ error: `Paper is not in flagged status` });
    }

    const reviewedAt = new Date();
    const reviewedBy = req.user.id;

    if (flagIndex !== undefined) {
      // Mark a specific flag
      if (flagIndex < 0 || flagIndex >= paper.anomalyFlags.length) {
        return res.status(400).json({ error: `flagIndex ${flagIndex} out of range` });
      }
      paper.anomalyFlags[flagIndex].reviewedByHuman = true;
      paper.anomalyFlags[flagIndex].decision = decision;
      paper.anomalyFlags[flagIndex].reviewNote = note || null;
      paper.anomalyFlags[flagIndex].reviewedAt = reviewedAt;
      paper.anomalyFlags[flagIndex].reviewedBy = reviewedBy;
    } else {
      // Mark ALL flags reviewed
      paper.anomalyFlags.forEach((flag) => {
        flag.reviewedByHuman = true;
        flag.decision = decision;
        flag.reviewNote = note || null;
        flag.reviewedAt = reviewedAt;
        flag.reviewedBy = reviewedBy;
      });
    }

    // If all flags are now reviewed, move paper out of flagged limbo.
    // "escalate" → stays flagged (admin takes over).
    // "dismiss" + all reviewed → back to submitted (student result confirmed).
    const allReviewed = paper.anomalyFlags.every((f) => f.reviewedByHuman);
    const anyEscalated = paper.anomalyFlags.some((f) => f.decision === "escalate");

    if (allReviewed && !anyEscalated) {
      paper.status = "submitted"; // coordinator cleared it — student result stands
    }
    // If escalated, status stays "flagged" for admin to handle (v2)

    await paper.save();

    res.json({
      success: true,
      paperId: paper._id,
      status: paper.status,
      allReviewed,
      anyEscalated,
      message: allReviewed
        ? anyEscalated
          ? "All flags reviewed. Paper escalated for admin action."
          : "All flags reviewed. Paper cleared — student result confirmed."
        : "Flag recorded. Other flags still pending review.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;