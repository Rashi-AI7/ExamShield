const fs = require("fs");
const path = require("path");

// ─── Audit Log Location ───────────────────────────────────────────────────────
// Logs go to /logs/audit.log — append-only, never overwritten.
// Constitution: immutable audit trail. No human or process should ever delete
// or edit this file. In production, ship these to a write-once S3 bucket.

const LOG_DIR = path.join(__dirname, "../../logs");
const LOG_FILE = path.join(LOG_DIR, "audit.log");

// Ensure logs directory exists on startup
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Core Logger ─────────────────────────────────────────────────────────────

const writeLog = (entry) => {
  const line = JSON.stringify(entry) + "\n";
  // appendFileSync is intentional — atomic, no buffering, no data loss on crash
  fs.appendFileSync(LOG_FILE, line, "utf8");
};

// ─── Middleware ───────────────────────────────────────────────────────────────

const auditLogger = (req, res, next) => {
  const startedAt = new Date();

  // Capture response status after it's sent
  const originalSend = res.send.bind(res);
  res.send = function (body) {
    const finishedAt = new Date();

    const entry = {
      // Who
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",

      // What
      method: req.method,
      route: req.originalUrl,
      params: req.params,
      query: req.query,

      // Result
      statusCode: res.statusCode,
      durationMs: finishedAt - startedAt,

      // When
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),

      // Constitution marker — humans review anomalies, never auto-action
      reviewedByHuman: false,
    };

    // Log sensitive routes with extra context (never log raw body — could
    // contain student data or API keys)
    if (req.originalUrl.includes("/paper/generate")) {
      entry.context = {
        studentId: req.body?.studentId || null,
        subject: req.body?.subject || null,
      };
    }

    if (req.originalUrl.includes("/questions/generate")) {
      entry.context = {
        subject: req.body?.subject || null,
        topic: req.body?.topic || null,
        difficulty: req.body?.difficulty || null,
      };
    }

    writeLog(entry);

    return originalSend(body);
  };

  next();
};

module.exports = auditLogger;
