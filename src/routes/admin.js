const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const User = require("../models/User");
const Paper = require("../models/Paper");
const Roster = require("../models/Roster");
const { sendExamCode } = require("../services/emailService");
const { authenticate, authorize } = require("../middleware/auth");

// All admin routes require admin role
router.use(authenticate, authorize("admin"));

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// List all users with role filter support
router.get("/users", async (req, res) => {
  try {
    const { role, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (role) filter.role = role;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/users/:id/deactivate ────────────────────────────────────
// Deactivate a user — they can no longer log in. Reversible.
router.patch("/users/:id/deactivate", async (req, res) => {
  try {
    if (req.params.id === req.user.id.toString())
      return res.status(400).json({ error: "Cannot deactivate your own account" });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select("-password");

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, message: `${user.name} deactivated`, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/users/:id/reactivate ────────────────────────────────────
router.patch("/users/:id/reactivate", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    ).select("-password");

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, message: `${user.name} reactivated`, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/papers/escalated ──────────────────────────────────────────
// Papers coordinator escalated — admin makes final decision
router.get("/papers/escalated", async (req, res) => {
  try {
    const papers = await Paper.find({
      status: "flagged",
      "anomalyFlags.decision": "escalate",
    })
      .select("studentId subject score anomalyFlags submittedAt totalTimeSeconds")
      .sort({ submittedAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, total: papers.length, papers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/papers/:paperId/score ────────────────────────────────────
// Score override — admin changes a student's final marks.
// Constitution: human decision required, mandatory reason, fully logged.
// This is the nuclear option — use only after full review.
router.patch("/papers/:paperId/score", async (req, res) => {
  try {
    const { overriddenMarks, reason } = req.body;

    if (overriddenMarks === undefined || overriddenMarks === null)
      return res.status(400).json({ error: "overriddenMarks is required" });
    if (!reason || reason.trim().length < 20)
      return res.status(400).json({ error: "reason is required and must be at least 20 characters" });

    const paper = await Paper.findById(req.params.paperId);
    if (!paper) return res.status(404).json({ error: "Paper not found" });

    const previousMarks = paper.score.overriddenMarks ?? paper.score.marks;

    paper.score.overriddenMarks = overriddenMarks;
    paper.score.overrideReason = reason.trim();
    paper.score.overriddenBy = req.user.id;
    paper.score.overriddenAt = new Date();

    // Override clears flagged status — admin has reviewed
    paper.status = "submitted";

    await paper.save();

    res.json({
      success: true,
      message: "Score overridden — audit trail recorded",
      paperId: paper._id,
      previousMarks,
      newMarks: overriddenMarks,
      overriddenBy: req.user.email,
      reason,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/audit ──────────────────────────────────────────────────────
// Read audit log — last N lines. Admin only.
router.get("/audit", async (req, res) => {
  try {
    const { lines = 100 } = req.query;
    const logPath = path.join(__dirname, "../../logs/audit.log");

    if (!fs.existsSync(logPath))
      return res.json({ success: true, entries: [], message: "No audit log found yet" });

    const content = fs.readFileSync(logPath, "utf8");
    const allLines = content.trim().split("\n").filter(Boolean);
    const lastN = allLines.slice(-parseInt(lines));

    const entries = lastN.map((line) => {
      try { return JSON.parse(line); }
      catch { return { raw: line }; }
    }).reverse(); // most recent first

    res.json({ success: true, total: allLines.length, returned: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [totalUsers, totalStudents, totalCoordinators, totalPapers, flaggedPapers, submittedPapers] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "student" }),
        User.countDocuments({ role: "coordinator" }),
        Paper.countDocuments(),
        Paper.countDocuments({ status: "flagged" }),
        Paper.countDocuments({ status: "submitted" }),
      ]);

    res.json({
      success: true,
      stats: {
        users: { total: totalUsers, students: totalStudents, coordinators: totalCoordinators },
        papers: { total: totalPapers, flagged: flaggedPapers, submitted: submittedPapers, active: totalPapers - flaggedPapers - submittedPapers },
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: there used to be a POST /api/admin/roster bulk-upload route here.
// It assumed an institution already held a clean list of candidates to
// upload — that doesn't hold for an open exam like NEET, which draws from
// droppers and students across thousands of schools with no single list
// anyone holds. Roster entries are now created automatically by the
// candidate's own self-registration (see auth.js register/verify). Removed
// rather than left in place, since it also predates the governmentId
// uniqueness requirement and would silently bypass it if ever called.

// ── GET /api/admin/roster ─────────────────────────────────────────────────────
// View roster — paginated. Shows every self-registered candidate and their
// exam code status. NEET is one exam, not four — there's no subject to
// filter by anymore.
router.get("/roster", async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Roster.countDocuments();
    const entries = await Roster.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Real aggregates over the full set, not just the current page — the
    // frontend's stat cards need these to stay correct past 50 entries.
    const codesIssued = await Roster.countDocuments({ examCode: { $ne: null } });
    const codesUsed = await Roster.countDocuments({ examCodeUsed: true });

    res.json({
      success: true,
      total,
      codesIssued,
      codesUsed,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      entries,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/roster/generate-codes ─────────────────────────────────────
// Generates exam access codes for ALL registered candidates without an unused
// code yet, for a single time window. There's no subject scoping anymore —
// NEET is one exam, one sitting, every candidate gets one code regardless of
// which sections they'll see (everyone sees all four). Run this close to
// exam day — the roster fills up via self-registration over weeks, but the
// window is usually only confirmed nearer the date.
// Re-running overwrites unused codes (e.g. if a slot was rescheduled);
// entries with an already-used code are left untouched so a redeemed code's
// history isn't erased.
router.post("/roster/generate-codes", async (req, res) => {
  try {
    const { windowStart, windowEnd } = req.body;
    if (!windowStart || !windowEnd)
      return res.status(400).json({ error: "windowStart and windowEnd are required" });

    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    if (isNaN(start) || isNaN(end) || end <= start)
      return res.status(400).json({ error: "windowStart and windowEnd must be valid dates with windowEnd after windowStart" });

    const entries = await Roster.find({ examCodeUsed: false });
    let updated = 0;
    const emailFailures = [];

    for (const entry of entries) {
      entry.examCode = Roster.generateCode();
      entry.examCodeWindowStart = start;
      entry.examCodeWindowEnd = end;
      await entry.save();
      updated++;

      // Send immediately — codes are useless to a student sitting at home
      // unless they actually receive them. A failed send here doesn't roll
      // back the generated code (re-running this route is the recovery path,
      // since it overwrites unused codes); it's reported so the admin knows
      // who to follow up with manually.
      const emailResult = await sendExamCode(entry.email, {
        name: entry.name,
        examCode: entry.examCode,
        windowStart: start,
        windowEnd: end,
        rollNumber: entry.rollNumber,
      });
      if (!emailResult.success) {
        emailFailures.push({ email: entry.email, rollNumber: entry.rollNumber, reason: emailResult.error });
      }
    }

    res.json({
      success: true,
      message: `Generated codes for ${updated} candidates`,
      updated,
      emailsSent: updated - emailFailures.length,
      emailFailures,
      windowStart: start,
      windowEnd: end,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/roster/:id/code ────────────────────────────────────────────
// Fetch one student's code + window, for printing/displaying on an admit slip.
// Deliberately a separate, narrow lookup rather than exposing codes in the
// general roster list — codes shouldn't appear in a bulk view by default.
router.get("/roster/:id/code", async (req, res) => {
  try {
    const entry = await Roster.findById(req.params.id).select(
      "name email rollNumber examCode examCodeWindowStart examCodeWindowEnd examCodeUsed"
    );
    if (!entry) return res.status(404).json({ error: "Roster entry not found" });
    if (!entry.examCode) return res.status(404).json({ error: "No code generated yet for this entry" });

    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
