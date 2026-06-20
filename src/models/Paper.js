const mongoose = require("mongoose");

const paperQuestionSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
  subject: String,
  topic: String,
  difficulty: String,
  variant: {
    questionText: String,
    options: { A: String, B: String, C: String, D: String },
    correctAnswer: String,
  },
  response: {
    selectedOption: { type: String, enum: ["A", "B", "C", "D", null], default: null },
    isCorrect: { type: Boolean, default: null },
    timeSpentSeconds: { type: Number, default: null },
    changesCount: { type: Number, default: 0 },
    finalChangeSecondsBefore: { type: Number, default: null },
  },
});

const paperSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true },
    questions: [paperQuestionSchema],
    paperHash: { type: String, unique: true },

    // Random access token — required to fetch or submit this paper.
    // Generated at paper creation, given to the student once.
    // Even knowing the paperId is useless without this token.
    accessToken: { type: String, required: true, unique: true },

    status: {
      type: String,
      enum: ["active", "submitted", "flagged"],
      default: "active",
    },

    generatedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    totalTimeSeconds: { type: Number, default: null },

    score: {
      correct: { type: Number, default: null },
      incorrect: { type: Number, default: null },
      unattempted: { type: Number, default: null },
      marks: { type: Number, default: null },
      // Admin score override — constitution requires human decision + reason
      overriddenMarks: { type: Number, default: null },
      overrideReason: { type: String, default: null },
      overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      overriddenAt: { type: Date, default: null },
    },

    anomalyFlags: [
      {
        type: { type: String },
        description: String,
        severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH"] },
        evidence: { type: mongoose.Schema.Types.Mixed },
        flaggedAt: { type: Date, default: Date.now },
        reviewedByHuman: { type: Boolean, default: false },
        decision: { type: String, enum: ["escalate", "dismiss"], default: null },
        reviewNote: { type: String, default: null },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],
  },
  { timestamps: true }
);

paperSchema.index({ studentId: 1, subject: 1 });
paperSchema.index({ status: 1 });
paperSchema.index({ accessToken: 1 });

module.exports = mongoose.model("Paper", paperSchema);
