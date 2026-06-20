const axios = require("axios");
const https = require("https");

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
  
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const httpsAgent = new https.Agent({
  keepAlive: true,
  timeout: 60000,
});

const callGemini = async (prompt, retries = 3) => {
  try {
    console.log("🚀 Calling Gemini...");

    const res = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      },
      {
        timeout: 60000,
        httpsAgent,
      }
    );

    console.log("✅ Gemini Success");
    return res.data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error("\n===== GEMINI ERROR =====");
    console.error("Status:", err.response?.status);
    console.error(JSON.stringify(err.response?.data, null, 2));
    console.error("========================\n");

    if (err.response?.status === 429 && retries > 0) {
      console.log(`⏳ Rate limited. Retrying in 3 seconds... (${retries} retries left)`);
      await sleep(3000);
      return callGemini(prompt, retries - 1);
    }

    throw err;
  }
};

// Style-specific instructions passed to Gemini to ensure variety within topics.
// Even if the same topic+difficulty is requested twice, a different style produces
// a meaningfully different question — defeating pattern memorisation.
const STYLE_INSTRUCTIONS = {
  numerical:
    "The question MUST require a numerical calculation. Include specific values (numbers, units). The answer must be a calculated number or expression. Wrong options should be common calculation mistakes.",
  conceptual:
    "The question MUST test conceptual understanding only — NO numbers or calculation. Test whether the student understands the principle, law, or definition. Wrong options should be plausible misconceptions.",
  "assertion-reason":
    "Format as: 'Assertion (A): [statement]. Reason (R): [statement].' Options must be: A) Both A and R are true, R is the correct explanation of A. B) Both A and R are true, R is NOT the correct explanation. C) A is true but R is false. D) A is false but R is true.",
  application:
    "Present a real-world scenario or experimental situation and ask the student to apply the concept to explain or predict an outcome. Make it feel like a practical problem, not a textbook definition.",
  comparison:
    "Ask the student to compare, rank, or distinguish between two or more related phenomena, quantities, or processes. Wrong options should involve common confusions between similar concepts.",
  exception:
    "Frame as 'Which of the following is INCORRECT / does NOT apply / is an exception to...' Tests depth of knowledge by requiring the student to identify the false statement among plausible ones.",
};

const generateQuestion = async (subject, topic, difficulty, style = "conceptual") => {
  const styleInstruction = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.conceptual;

  const prompt = `You are a NEET exam question generator for India. Return ONLY valid JSON, no markdown, no explanation.

Generate 2 variants of a high-quality MCQ for the NEET exam:
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}
Question style: ${style}

Style requirement: ${styleInstruction}

Rules:
- Both variants must test the SAME concept from different angles
- Each variant must have exactly 4 options (A, B, C, D)
- Only one option is correct
- Wrong options must be plausible — not obviously wrong
- Language must be clear and unambiguous
- Do NOT repeat the same question with just numbers changed

Return this exact JSON structure:
{"variants":[{"questionText":"full question text here","options":{"A":"option text","B":"option text","C":"option text","D":"option text"},"correctAnswer":"A"},{"questionText":"variant 2 question text","options":{"A":"option text","B":"option text","C":"option text","D":"option text"},"correctAnswer":"B"}],"tags":["${topic}","${difficulty}"],"approved":true,"reasoning":"one sentence: why these questions test ${topic} at ${difficulty} level"}`;

  const raw = await callGemini(prompt);
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};

module.exports = { generateQuestion };