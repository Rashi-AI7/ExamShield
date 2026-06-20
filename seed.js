require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ─── CLI args ─────────────────────────────────────────────────────────────────
// Usage:
//   node seed.js              → runs until all slots are full (original behaviour)
//   node seed.js --limit 100  → stops after 100 new questions (daily cap)

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const DAILY_LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity;

if (DAILY_LIMIT !== Infinity && (isNaN(DAILY_LIMIT) || DAILY_LIMIT <= 0)) {
  console.error("❌ --limit must be a positive number. e.g. node seed.js --limit 100");
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const QUESTIONS_PER_SLOT = 6;
const DELAY_BETWEEN_CALLS_MS = 4000;
const MAX_RETRIES = 3;
const PROGRESS_FILE = path.join(__dirname, "seed-progress.json");

// ─── Question style variety ───────────────────────────────────────────────────
// Rotated per question within a slot so the same topic produces different styles.
// The Gemini prompt in geminiService.js will receive this as a hint.
// We inject it as an optional `style` field in the POST body.

const QUESTION_STYLES = [
  "numerical",        // calculation-based, requires working through numbers
  "conceptual",       // tests understanding of principles, no calculation
  "assertion-reason", // two statements, student judges if both are true and related
  "application",      // real-world scenario applying the concept
  "comparison",       // asks student to compare two related phenomena or quantities
  "exception",        // "which of the following is NOT..." style
];

// ─── Expanded NEET Syllabus ───────────────────────────────────────────────────
// Original: 12 Physics + 10 Chemistry + 12 Biology = 34 topics
// Expanded: 18 Physics + 16 Chemistry + 18 Biology = 52 topics
// New topics marked with ★

const SYLLABUS = {
  Physics: [
    "Kinematics",
    "Laws of Motion",
    "Work, Energy and Power",
    "Rotational Motion",
    "Gravitation",
    "Thermodynamics",
    "Waves and Oscillations",
    "Electrostatics",
    "Current Electricity",
    "Magnetic Effects of Current",
    "Optics",
    "Modern Physics",
    "Properties of Matter",           // ★ elasticity, viscosity, surface tension
    "Kinetic Theory of Gases",        // ★ rms speed, degrees of freedom, mean free path
    "Electromagnetic Induction",      // ★ Faraday's law, Lenz's law, eddy currents
    "Alternating Current",            // ★ RMS, impedance, resonance, power factor
    "Dual Nature of Matter",          // ★ photoelectric effect, de Broglie, Davisson-Germer
    "Nuclear Physics",                // ★ binding energy, radioactive decay, nuclear reactions
  ],
  Chemistry: [
    "Atomic Structure",
    "Chemical Bonding",
    "Thermodynamics",
    "Equilibrium",
    "Electrochemistry",
    "Organic Chemistry - Basic Principles",
    "Hydrocarbons",
    "Biomolecules",
    "Polymers",
    "p-Block Elements",
    "Redox Reactions",                // ★ oxidation states, balancing, disproportionation
    "Solutions",                      // ★ colligative properties, Raoult's law, van't Hoff
    "Chemical Kinetics",              // ★ rate laws, Arrhenius, half-life, order
    "Surface Chemistry",              // ★ adsorption, catalysis, colloids, emulsions
    "d and f Block Elements",         // ★ transition metals, lanthanides, actinides
    "Coordination Compounds",         // ★ IUPAC naming, isomerism, crystal field theory
  ],
  Biology: [
    "Cell Structure and Function",
    "Cell Division",
    "Plant Physiology",
    "Human Physiology - Digestion",
    "Human Physiology - Circulation",
    "Human Physiology - Excretion",
    "Genetics and Heredity",
    "Molecular Basis of Inheritance",
    "Evolution",
    "Ecology and Environment",
    "Reproduction in Plants",
    "Reproduction in Animals",
    "Biological Classification",      // ★ five kingdom, binomial nomenclature, basis of classification
    "Plant Kingdom",                  // ★ algae, bryophytes, pteridophytes, gymnosperms, angiosperms
    "Animal Kingdom",                 // ★ basis of classification, phyla characteristics
    "Structural Organisation",        // ★ tissues in plants and animals, organ systems
    "Biotechnology - Principles",     // ★ recombinant DNA, restriction enzymes, PCR, cloning
    "Biotechnology - Applications",   // ★ GM crops, insulin, gene therapy, biopiracy
  ],
};

const DIFFICULTIES = ["Easy", "Medium", "Hard"];

// ─── Progress file ────────────────────────────────────────────────────────────

const loadProgress = () => {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      console.log(`📂 Resuming from saved progress (${PROGRESS_FILE})`);
      return data;
    }
  } catch {
    console.log("⚠️  Could not read progress file — starting fresh");
  }
  return {};
};

const saveProgress = (progress) => {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

const slotKey = (subject, topic, difficulty) => `${subject}|${topic}|${difficulty}`;

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let currentProgress = {};
let isStopping = false;

const handleShutdown = () => {
  if (isStopping) return;
  isStopping = true;
  console.log("\n\n⏸️  Paused — saving progress...");
  saveProgress(currentProgress);
  const done = Object.values(currentProgress).reduce((a, ids) => a + ids.length, 0);
  console.log(`✅ Progress saved — ${done} questions safe in seed-progress.json`);
  console.log(`▶️  Run 'node seed.js' again anytime to continue.\n`);
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let AUTH_TOKEN = null;

const login = async () => {
  // Step 1: init login (sends OTP)
  await axios.post(`${BASE_URL}/api/auth/login/init`, {
    email: process.env.SEED_EMAIL,
    password: process.env.SEED_PASSWORD,
  });

  // Step 2: ask for OTP in terminal
  const { createInterface } = require("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const otp = await new Promise((resolve) => {
    rl.question("📧 OTP sent to your email. Enter it here: ", (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });

  // Step 3: verify OTP and get token
  const res = await axios.post(`${BASE_URL}/api/auth/login/verify`, {
    email: process.env.SEED_EMAIL,
    otp,
  });

  AUTH_TOKEN = res.data.token;
  console.log("🔐 Authenticated successfully\n");
};

const generateOne = async (subject, topic, difficulty, style, attempt = 1) => {
  try {
    const res = await axios.post(
      `${BASE_URL}/api/questions/generate`,
      { subject, topic, difficulty, style },
      { timeout: 90000, headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );
    return { success: true, id: res.data.question._id };
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error || err.message;

    if (attempt <= MAX_RETRIES) {
      const wait = attempt * 5000;
      console.log(`    ⏳ Attempt ${attempt} failed (${status || "timeout"}) — retrying in ${wait / 1000}s...`);
      await sleep(wait);
      return generateOne(subject, topic, difficulty, style, attempt + 1);
    }

    return { success: false, error: msg };
  }
};

const buildSlots = () => {
  const slots = [];
  for (const [subject, topics] of Object.entries(SYLLABUS)) {
    for (const topic of topics) {
      for (const difficulty of DIFFICULTIES) {
        slots.push({ subject, topic, difficulty });
      }
    }
  }
  return slots;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const run = async () => {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║    ExamShield — Question Bank Seeder v2    ║");
  console.log("║    Resumable · Style-varied · Daily cap    ║");
  console.log("╚════════════════════════════════════════════╝\n");

  if (DAILY_LIMIT !== Infinity) {
    console.log(`🎯 Daily limit: ${DAILY_LIMIT} questions this session\n`);
  }

  try {
    await axios.get(BASE_URL, { timeout: 5000 });
    console.log("✅ Server is up\n");
  } catch {
    console.error("❌ Server not reachable at", BASE_URL);
    console.error("   Start it first: node server.js\n");
    process.exit(1);
  }

  await login();
  currentProgress = loadProgress();
  const slots = buildSlots();
  const totalCalls = slots.length * QUESTIONS_PER_SLOT;

  const alreadyDone = Object.values(currentProgress).reduce((a, ids) => a + ids.length, 0);
  const remaining = Math.min(totalCalls - alreadyDone, DAILY_LIMIT);

  console.log(`📋 Subjects: ${Object.keys(SYLLABUS).join(", ")}`);
  console.log(`   Topics total           : ${slots.length / DIFFICULTIES.length}`);
  console.log(`   Total slots            : ${totalCalls}`);
  console.log(`   Already done           : ${alreadyDone}`);
  console.log(`   Target this session    : ${remaining}`);
  console.log(`   Est. time             : ~${Math.ceil((remaining * DELAY_BETWEEN_CALLS_MS) / 60000)} minutes`);
  console.log(`   Question styles        : ${QUESTION_STYLES.join(", ")}`);
  console.log(`\n💡 Press Ctrl+C anytime to pause safely.\n`);
  console.log("─".repeat(52));

  const stats = { passed: 0, failed: 0, skipped: 0 };
  let sessionCount = 0;

  for (const { subject, topic, difficulty } of slots) {
    if (isStopping) break;
    if (sessionCount >= DAILY_LIMIT) {
      console.log(`\n🎯 Daily limit of ${DAILY_LIMIT} reached. Run again tomorrow.`);
      break;
    }

    const key = slotKey(subject, topic, difficulty);
    const doneForSlot = (currentProgress[key] || []).length;

    if (doneForSlot >= QUESTIONS_PER_SLOT) {
      stats.skipped += QUESTIONS_PER_SLOT;
      continue;
    }

    const startFrom = doneForSlot + 1;
    console.log(`\n▶ ${subject} | ${topic} | ${difficulty}${doneForSlot > 0 ? ` (resuming from q${startFrom})` : ""}`);

    for (let i = startFrom; i <= QUESTIONS_PER_SLOT; i++) {
      if (isStopping) break;
      if (sessionCount >= DAILY_LIMIT) break;

      // Rotate style based on question index within slot
      const style = QUESTION_STYLES[(i - 1) % QUESTION_STYLES.length];
      const globalNum = alreadyDone + sessionCount + 1;

      process.stdout.write(`  [${globalNum}] Q${i}/${QUESTIONS_PER_SLOT} (${style})... `);

      const result = await generateOne(subject, topic, difficulty, style);

      if (result.success) {
        console.log(`✅ ${result.id}`);
        stats.passed++;
        sessionCount++;

        if (!currentProgress[key]) currentProgress[key] = [];
        currentProgress[key].push(result.id);
        saveProgress(currentProgress);
      } else {
        console.log(`❌ ${result.error}`);
        stats.failed++;
        sessionCount++; // count failures toward limit too — don't burn RPD on retries
      }

      if (!isStopping && sessionCount < DAILY_LIMIT) {
        await sleep(DELAY_BETWEEN_CALLS_MS);
      }
    }
  }

  if (isStopping) return;

  // ─── Summary ──────────────────────────────────────────────────────────────
  const totalNow = alreadyDone + stats.passed;
  console.log("\n" + "═".repeat(52));
  console.log("SESSION COMPLETE");
  console.log("═".repeat(52));
  console.log(`✅ Generated this session : ${stats.passed}`);
  console.log(`⏭️  Skipped (already done) : ${stats.skipped}`);
  console.log(`❌ Failed                 : ${stats.failed}`);
  console.log(`📦 Total in bank now      : ${totalNow}`);

  const allDone = Object.values(currentProgress).reduce((a, ids) => a + ids.length, 0);
  if (allDone >= totalCalls) {
    console.log(`\n🎉 Full syllabus complete! All ${totalCalls} slots filled.`);
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log("🧹 seed-progress.json deleted — clean finish.");
    }
  } else {
    const pct = Math.round((allDone / totalCalls) * 100);
    console.log(`\n📈 Syllabus coverage: ${allDone}/${totalCalls} (${pct}%)`);
    console.log(`▶️  Run 'node seed.js --limit 100' tomorrow to continue.`);
  }
  console.log();
};

run().catch((err) => {
  console.error("💥 Seed script crashed:", err.message);
  saveProgress(currentProgress);
  console.error("Progress saved — run again to resume.");
  process.exit(1);
});