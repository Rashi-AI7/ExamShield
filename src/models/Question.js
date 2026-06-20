const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: {
    A: { type: String, required: true },
    B: { type: String, required: true },
    C: { type: String, required: true },
    D: { type: String, required: true },
  },
  correctAnswer: { type: String, enum: ["A", "B", "C", "D"], required: true },
});

const questionSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      enum: ["Physics", "Chemistry", "Biology", "Mathematics"],
    },
    topic: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      required: true,
    },
    variants: {
      type: [variantSchema],
      validate: {
        validator: (v) => v.length >= 2,
        message: "Each question must have at least 2 variants",
      },
    },
    approvedByAI: { type: Boolean, default: false },
    approvalDetails: {
      model: { type: String },
      reasoning: { type: String },
      approvedAt: { type: Date },
    },
    usedCount: { type: Number, default: 0 },
    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Index for fast paper assembly queries
questionSchema.index({ subject: 1, topic: 1, difficulty: 1, approvedByAI: 1 });

module.exports = mongoose.model("Question", questionSchema);