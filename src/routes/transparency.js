const express = require("express");
const router = express.Router();
const Paper = require("../models/Paper");

// ── GET /api/transparency/:paperHash ──────────────────────────────────────────
// PUBLIC. No authentication. This is the one endpoint in ExamShield designed
// for a stranger on the internet to hit directly — a student, a parent, a
// journalist, anyone holding a paper hash.
//
// Constitution applies here with zero exceptions:
//   - No question text, no options, no correct answers — ever.
//   - No student name, email, or any personally identifying detail.
//   - Only the verifiable facts: when generated, when submitted, current
//     status, and whether a human has reviewed any flagged anomaly.
//
// This exists to make a specific kind of lie impossible: a screenshot or
// rumour claiming "this paper was leaked / pre-filled / never really
// reviewed" can be checked here against the system's own timestamped record,
// not against another unverifiable claim.
router.get("/:paperHash", async (req, res) => {
  try {
    const { paperHash } = req.params;
    if (!paperHash || paperHash.length < 10) {
      return res.status(400).json({ error: "A valid paper hash is required" });
    }

    const paper = await Paper.findOne({ paperHash }).lean();
    if (!paper) {
      // Deliberately vague — same response whether the hash is malformed,
      // unknown, or belongs to a paper that doesn't exist. Never hint at
      // why a lookup failed; that distinction has no public value and
      // narrowing it down could help someone probe for valid hashes.
      return res.status(404).json({ found: false, message: "No record found for this paper hash" });
    }

    // Reviewed-state isn't a plain yes/no — collapsing it would hide the
    // real difference between "nothing to review" and "review pending".
    let reviewState;
    if (paper.anomalyFlags.length === 0) {
      reviewState = "not_flagged";
    } else if (paper.anomalyFlags.every((f) => f.reviewedByHuman)) {
      reviewState = paper.anomalyFlags.some((f) => f.decision === "escalate")
        ? "reviewed_escalated"
        : "reviewed_cleared";
    } else {
      reviewState = "pending_human_review";
    }

    // Section breakdown — NEET is one exam with four sections inside one
    // paper (Physics/Chemistry/Botany/Zoology), not a single "subject".
    // Showing the real breakdown gives a stranger something concrete and
    // checkable, rather than a flat constant that says nothing.
    const sectionCounts = {};
    for (const q of paper.questions) {
      sectionCounts[q.subject] = (sectionCounts[q.subject] || 0) + 1;
    }

    res.json({
      found: true,
      paperHash: paper.paperHash,
      examName: "NEET",
      sectionCounts,
      status: paper.status, // active | submitted | flagged
      generatedAt: paper.generatedAt,
      submittedAt: paper.submittedAt || null,
      totalQuestions: paper.questions.length,
      reviewState,
      flagCount: paper.anomalyFlags.length,
      // Marks are shown only once a paper is fully settled (submitted, not
      // mid-review) — a flagged-but-unreviewed score isn't confirmed yet,
      // and showing a number that might still change would mislead, not inform.
      confirmedMarks: paper.status === "submitted" ? paper.score?.marks ?? null : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
