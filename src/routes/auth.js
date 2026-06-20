const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const Roster = require("../models/Roster");
const { sendOTP } = require("../services/emailService");
const { isValidAadhaar, normalizeAadhaar } = require("../utils/aadhaarValidator");
const { authenticate, authorize } = require("../middleware/auth");

const signToken = (user) =>
  jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );

// ── REGISTER STEP 1: POST /api/auth/register/init ────────────────────────────
// Takes name, email, password, role. Students also supply governmentId —
// there's no institution-provided list to check against for an open exam
// like NEET, so the candidate's own registration *is* the source of truth.
// NEET is ONE exam with four sections, not four exams — there is no
// per-subject registration anymore, a candidate registers once for THE exam.
// Sends OTP. Does NOT create user or roster entry yet — both wait until OTP
// verification succeeds.
router.post("/register/init", async (req, res) => {
  try {
    const { name, email, password, role = "student", governmentId } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: "name, email, and password are required" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const userCount = await User.countDocuments();

    // Bootstrap: first user ever skips OTP and is auto-admin
    if (userCount === 0) {
      const user = await User.create({ name, email, password, role: "admin" });
      return res.status(201).json({
        success: true,
        bootstrap: true,
        message: "Admin account created (bootstrap — OTP skipped for first user)",
        token: signToken(user),
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
    }

    // Elevated role creation requires admin token
    if (role === "coordinator" || role === "admin") {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer "))
        return res.status(403).json({ error: "Admin token required to create coordinator/admin accounts" });
      let decoded;
      try { decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET); }
      catch { return res.status(401).json({ error: "Invalid or expired token" }); }
      if (decoded.role !== "admin")
        return res.status(403).json({ error: "Only admins can assign elevated roles" });
    }

    // Self-registration: a candidate provides their own government ID at
    // registration time, since no institution holds this data in advance.
    // governmentId is the real uniqueness anchor (email alone is trivially
    // defeatable with a second address). v1 only accepts Aadhaar, validated
    // by format + the real Verhoeff checksum UIDAI uses — this rejects
    // obviously-fake input (wrong length, fails checksum) but does NOT
    // verify the number actually belongs to the registrant or is a real
    // issued number; that requires a live government API, deferred to v2.
    let normalizedId = null;
    if (role === "student") {
      if (!governmentId || !governmentId.trim())
        return res.status(400).json({ error: "Aadhaar number is required to register" });

      normalizedId = normalizeAadhaar(governmentId.trim());
      if (!isValidAadhaar(normalizedId))
        return res.status(400).json({ error: "That doesn't look like a valid Aadhaar number — check the digits and try again" });

      const idTaken = await Roster.findOne({ governmentId: normalizedId });
      if (idTaken)
        return res.status(409).json({ error: "This Aadhaar number is already registered" });

      const emailTaken = await Roster.findOne({ email: email.toLowerCase().trim() });
      if (emailTaken)
        return res.status(409).json({ error: "This email is already registered" });
    }

    // Store registration data in OTP record — verified before user OR roster
    // entry is created, so an abandoned OTP flow never leaves a half-made record.
    const otp = await OTP.createOTP(email, "register", {
      name, email, password, role, governmentId: normalizedId,
    });
    const emailResult = await sendOTP(email, otp, "register");

    if (!emailResult.success)
      return res.status(500).json({ error: "Failed to send OTP — please try again" });

    res.status(200).json({
      success: true,
      message: `OTP sent to ${email}. Valid for 10 minutes.`,
      nextStep: "POST /api/auth/register/verify with { email, otp }",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REGISTER STEP 2: POST /api/auth/register/verify ──────────────────────────
// Verifies OTP, creates the user, and — for students — creates their roster
// entry now, generating a roll number for THE exam (one exam, four sections,
// not four separate exams). Nobody pre-loaded this candidate; this is the
// moment their exam slot first comes into existence.
router.post("/register/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "email and otp required" });

    const result = await OTP.verifyOTP(email, "register", otp);
    if (!result.valid) return res.status(400).json({ error: result.reason });

    const { name, password, role, governmentId } = result.pendingData;
    const user = await User.create({ name, email, password, role });

    if (role === "student") {
      // Re-check uniqueness here too (not just at init) to close the race
      // where two OTP flows for the same email/governmentId run concurrently.
      const duplicate = await Roster.findOne({
        $or: [
          { email: email.toLowerCase().trim() },
          { governmentId },
        ],
      });
      if (duplicate) {
        await User.findByIdAndDelete(user._id);
        return res.status(409).json({ error: "This email or Aadhaar number has already been registered" });
      }

      // Roll number generation can collide under concurrent writes (see note
      // in Roster.js) — retry a few times on a duplicate-key error rather
      // than surfacing a raw 500 for what's actually a rare, recoverable race.
      let created = null;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        try {
          const rollNumber = await Roster.generateRollNumber();
          created = await Roster.create({
            name,
            email: email.toLowerCase().trim(),
            governmentId,
            idType: "aadhaar",
            rollNumber,
            claimed: true,
            claimedBy: user._id,
            claimedAt: new Date(),
          });
        } catch (err) {
          if (err.code !== 11000 || attempt === 2) {
            await User.findByIdAndDelete(user._id);
            throw err;
          }
          // duplicate key on rollNumber — loop and try the next number
        }
      }
    }

    res.status(201).json({
      success: true,
      message: "Account verified and created",
      token: signToken(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LOGIN STEP 1: POST /api/auth/login/init ───────────────────────────────────
// Validates password. For coordinators/admins, sends an OTP (they're not in
// a locked-down exam hall, OTP-over-email is fine). For students, OTP is
// skipped entirely — exam centers ban personal devices, so requiring a
// student to read an OTP off their phone at the center recreates the exact
// problem the exam access code was built to solve. A student's real
// security gate on exam day is the one-time exam code (see paper/generate),
// not their login — so login just needs to confirm their password and hand
// back a token immediately.
router.post("/login/init", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await User.findOne({ email });
    if (!user || !user.isActive) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await user.verifyPassword(password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    if (user.role === "student") {
      return res.json({
        success: true,
        otpSkipped: true,
        token: signToken(user),
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
    }

    const otp = await OTP.createOTP(email, "login");
    const emailResult = await sendOTP(email, otp, "login");

    if (!emailResult.success)
      return res.status(500).json({ error: "Failed to send OTP — please try again" });

    res.json({
      success: true,
      message: `OTP sent to ${email}. Valid for 10 minutes.`,
      nextStep: "POST /api/auth/login/verify with { email, otp }",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LOGIN STEP 2: POST /api/auth/login/verify ─────────────────────────────────
router.post("/login/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "email and otp required" });

    const result = await OTP.verifyOTP(email, "login", otp);
    if (!result.valid) return res.status(400).json({ error: result.reason });

    const user = await User.findOne({ email });
    if (!user || !user.isActive) return res.status(401).json({ error: "Account not found" });

    res.json({
      success: true,
      token: signToken(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
