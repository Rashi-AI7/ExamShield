const express = require("express");
const router = express.Router();
const Question = require("../models/Question");
const { generateQuestion } = require("../services/geminiService");
const { authenticate, authorize } = require("../middleware/auth");

// Fields never returned by any API response.
// Question text and correct answers live in MongoDB only —
// they exit the server only inside the paper assembly pipeline (stripped before client delivery).
const QUESTION_SAFE_PROJECTION = {
  subject: 1,
  topic: 1,
  difficulty: 1,
  tags: 1,
  approvedByAI: 1,
  isActive: 1,
  approvalDetails: 1,
  createdAt: 1,
  // variants.questionText → omitted
  // variants.correctAnswer → omitted
  // variants.options → omitted (options alone are useless without question text)
};

// POST /api/questions/generate — coordinator + admin only
router.post("/generate", authenticate, authorize("coordinator", "admin"), async (req, res) => {
  try {
    const { subject, topic, difficulty, style } = req.body;

    if (!subject || !topic || !difficulty)
      return res.status(400).json({ error: "subject, topic, difficulty required" });

    const aiResult = await generateQuestion(subject, topic, difficulty, style);

    const question = await Question.create({
      subject,
      topic,
      difficulty,
      variants: aiResult.variants,
      tags: aiResult.tags,
      approvedByAI: aiResult.approved,
      approvalDetails: {
        model: "gemini-3.1-flash-lite",
        reasoning: aiResult.reasoning,
        approvedAt: new Date(),
      },
    });

    // Return safe version — no question text or answers even in the creation response
    res.status(201).json({
      success: true,
      question: {
        _id: question._id,
        subject: question.subject,
        topic: question.topic,
        difficulty: question.difficulty,
        tags: question.tags,
        approvedByAI: question.approvedByAI,
        approvalDetails: question.approvalDetails,
        variantCount: question.variants.length,
        createdAt: question.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questions — coordinator + admin only
// Returns metadata only — no question text, no options, no correct answers.
// Nobody sees actual question content through this endpoint. Ever.
router.get("/", authenticate, authorize("coordinator", "admin"), async (req, res) => {
  try {
    const { subject, difficulty, limit = 50, page = 1 } = req.query;
    const filter = { approvedByAI: true, isActive: true };
    if (subject) filter.subject = subject;
    if (difficulty) filter.difficulty = difficulty;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Question.countDocuments(filter);
    const questions = await Question.find(filter, QUESTION_SAFE_PROJECTION)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      count: questions.length,
      questions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/questions/:id/deactivate — admin only
// Removes a question from active use without deleting it (audit trail preserved).
router.patch("/:id/deactivate", authenticate, authorize("admin"), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: "reason is required" });

    const question = await Question.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: req.user.id,
        deactivationReason: reason,
      },
      { new: true }
    );

    if (!question) return res.status(404).json({ error: "Question not found" });

    res.json({
      success: true,
      message: "Question deactivated — removed from paper assembly",
      questionId: question._id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
