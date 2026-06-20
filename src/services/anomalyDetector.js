const Paper = require("../models/Paper");

// ─── ExamShield Constitution ──────────────────────────────────────────────────
// This service ONLY detects and flags. It NEVER:
//   - Cancels a paper
//   - Disqualifies a student
//   - Modifies a score
//   - Takes any action on its own
//
// Sacred action chain: AI flags evidence → Human reviews → System executes.
// Every flag produced here has reviewedByHuman: false by default.
// A human coordinator must review before anything happens to a student.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Thresholds ───────────────────────────────────────────────────────────────
// Tunable — will be refined as real exam data comes in (v2 psychometrics)

const THRESHOLDS = {
  // Minimum seconds a student should realistically spend per question
  // NEET has 180 min for 180 questions = 60s avg. Below 10s avg = suspicious.
  minSecondsPerQuestion: 10,

  // If total exam time is under this, flag it. This used to be a flat 120s
  // ("2 minutes for any paper = impossible"), which made sense when papers
  // had ~7-9 questions. At NEET's real 180-question scale that floor is far
  // too loose to ever meaningfully fire — 120s for 180 questions is already
  // an extreme outlier on its own, so a flat constant stopped doing useful
  // work once the paper size changed. Scaled to track the per-question
  // floor instead: minSecondsPerQuestion x total questions x a small safety
  // factor, so this stays meaningful as SECTION_TARGET_COUNTS grows toward
  // the real 180.
  minTotalExamSecondsPerQuestion: 3, // well under the realistic ~60s/question pace

  // What % of questions answered identically to another student triggers flag
  // (checked across all submitted papers for same subject)
  identicalAnswerPatternThreshold: 0.85, // 85% same sequence = suspicious

  // If student changed answer in final N seconds before submit
  lastSecondChangeWindow: 10,

  // How many last-second changes before it's flagged
  lastSecondChangesRequired: 3,
};

// ─── Individual Detectors ─────────────────────────────────────────────────────

/**
 * Detector 1: Impossible timing
 * If total time or per-question time is humanly impossible, flag it.
 */
const detectImpossibleTiming = (paper, responses) => {
  const flags = [];

  if (!paper.totalTimeSeconds) return flags;

  // Total paper time too short — scales with actual question count rather
  // than a flat constant, so this stays meaningful whether the paper has
  // 7 questions (early MVP) or the real NEET 180.
  const minTotalSeconds = paper.questions.length * THRESHOLDS.minTotalExamSecondsPerQuestion;
  if (paper.totalTimeSeconds < minTotalSeconds) {
    flags.push({
      type: "IMPOSSIBLE_TOTAL_TIME",
      description: `Paper submitted in ${paper.totalTimeSeconds}s. Minimum realistic time for ${paper.questions.length} questions is ${minTotalSeconds}s.`,
      severity: "HIGH",
      evidence: {
        totalTimeSeconds: paper.totalTimeSeconds,
        totalQuestions: responses.length,
        secondsPerQuestion: (paper.totalTimeSeconds / responses.length).toFixed(2),
      },
      reviewedByHuman: false,
    });
  }

  // Per-question time too short
  const answeredQuestions = responses.filter((r) => r.selectedOption !== null);
  if (answeredQuestions.length > 0) {
    const suspiciouslyFast = answeredQuestions.filter(
      (r) => r.timeSpentSeconds !== null &&
             r.timeSpentSeconds < THRESHOLDS.minSecondsPerQuestion
    );

    const fastRatio = suspiciouslyFast.length / answeredQuestions.length;
    if (fastRatio > 0.5) {
      // More than half the answers were too fast
      flags.push({
        type: "IMPOSSIBLE_PER_QUESTION_TIME",
        description: `${suspiciouslyFast.length}/${answeredQuestions.length} answered questions took under ${THRESHOLDS.minSecondsPerQuestion}s each.`,
        severity: "HIGH",
        evidence: {
          fastQuestionCount: suspiciouslyFast.length,
          totalAnswered: answeredQuestions.length,
          fastRatio: fastRatio.toFixed(2),
          worstCase: Math.min(...suspiciouslyFast.map((r) => r.timeSpentSeconds)),
        },
        reviewedByHuman: false,
      });
    }
  }

  return flags;
};

/**
 * Detector 2: Last-second answer changes
 * Changing answers repeatedly in the final seconds before submit
 * is a signal of real-time coaching (earpiece, phone, signal from outside).
 */
const detectLastSecondChanges = (responses) => {
  const flags = [];

  const lastSecondChanges = responses.filter(
    (r) =>
      r.finalChangeSecondsBefore !== null &&
      r.finalChangeSecondsBefore <= THRESHOLDS.lastSecondChangeWindow &&
      r.changesCount > 0
  );

  if (lastSecondChanges.length >= THRESHOLDS.lastSecondChangesRequired) {
    flags.push({
      type: "LAST_SECOND_CHANGES",
      description: `${lastSecondChanges.length} answers changed in the final ${THRESHOLDS.lastSecondChangeWindow}s before submission. Possible real-time coaching.`,
      severity: "MEDIUM",
      evidence: {
        changedInFinalWindow: lastSecondChanges.length,
        windowSeconds: THRESHOLDS.lastSecondChangeWindow,
        questions: lastSecondChanges.map((r) => ({
          questionId: r.questionId,
          changesCount: r.changesCount,
          finalChangeSecondsBeforeSubmit: r.finalChangeSecondsBefore,
        })),
      },
      reviewedByHuman: false,
    });
  }

  return flags;
};

/**
 * Detector 3: Identical answer pattern across students
 * If two students' answer sequences are suspiciously similar,
 * it could indicate a paper leak or coordinated cheating.
 * This runs ACROSS papers — compares this submission to every other
 * submitted paper. The subject filter below is effectively a no-op now
 * that NEET is one unified exam (every paper has subject: "NEET") — kept
 * rather than removed in case ExamShield is ever reused for a context with
 * genuinely distinct exam types again, where the filter would matter.
 *
 * KNOWN LIMITATION (acceptable for v1, real concern at scale): this pulls
 * every other submitted paper's full question/response data into memory on
 * every single submission. Fine at the volumes a v1 launch will see; would
 * need to move to a database-side aggregation or a precomputed index before
 * this could safely handle thousands of concurrent submissions. Tracked
 * alongside the load-testing work already deferred to v2 in the handoff doc.
 */
const detectIdenticalPatterns = async (currentPaper, responses) => {
  const flags = [];

  // Get all other submitted papers for the same subject
  const otherPapers = await Paper.find({
    subject: currentPaper.subject,
    status: "submitted",
    studentId: { $ne: currentPaper.studentId },
    "questions.response.selectedOption": { $ne: null },
  }).lean();

  if (otherPapers.length === 0) return flags;

  // Build answer sequence for current paper
  const currentSequence = responses
    .map((r) => r.selectedOption || "X")
    .join("");

  const matches = [];

  for (const other of otherPapers) {
    const otherSequence = other.questions
      .map((q) => q.response?.selectedOption || "X")
      .join("");

    // Compare sequences position by position
    const minLen = Math.min(currentSequence.length, otherSequence.length);
    if (minLen === 0) continue;

    let matchCount = 0;
    for (let i = 0; i < minLen; i++) {
      if (currentSequence[i] === otherSequence[i]) matchCount++;
    }

    const similarity = matchCount / minLen;

    if (similarity >= THRESHOLDS.identicalAnswerPatternThreshold) {
      matches.push({
        otherStudentId: other.studentId,
        similarity: similarity.toFixed(3),
        matchedPositions: matchCount,
        totalPositions: minLen,
      });
    }
  }

  if (matches.length > 0) {
    flags.push({
      type: "IDENTICAL_ANSWER_PATTERN",
      description: `Answer sequence is ${(matches[0].similarity * 100).toFixed(1)}% identical to ${matches.length} other student(s). Possible paper leak or coordinated cheating.`,
      severity: matches.length >= 3 ? "HIGH" : "MEDIUM",
      evidence: {
        matchCount: matches.length,
        matches,
        currentStudentSequence: currentSequence,
      },
      reviewedByHuman: false,
    });
  }

  return flags;
};

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Run all detectors against a submitted paper.
 * Returns array of flags — empty array means no anomalies detected.
 *
 * NEVER call paper.save() here. Never modify scores. Never take action.
 * Just return the flags. The submit route decides what to store.
 */
const analyzeSubmission = async (paper, responses) => {
  const allFlags = [];

  try {
    const timingFlags = detectImpossibleTiming(paper, responses);
    allFlags.push(...timingFlags);

    const lastSecondFlags = detectLastSecondChanges(responses);
    allFlags.push(...lastSecondFlags);

    const patternFlags = await detectIdenticalPatterns(paper, responses);
    allFlags.push(...patternFlags);
  } catch (err) {
    // Anomaly detector must NEVER crash the submit flow.
    // If detection fails, log it and return empty — student submission goes through.
    console.error("⚠️  Anomaly detector error (non-fatal):", err.message);
  }

  return allFlags;
};

module.exports = { analyzeSubmission };
