const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

const sendOTP = async (email, otp, purpose) => {
  const subject = purpose === "register"
    ? "Verify your ExamShield account"
    : "Your ExamShield login OTP";

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;background:#0B1120;color:#F0F4FF;padding:40px;border-radius:12px">
      <div style="font-size:11px;letter-spacing:1.5px;color:#6366F1;margin-bottom:16px">EXAMSHIELD · INTEGRITY PLATFORM</div>
      <h2 style="font-size:22px;font-weight:700;margin:0 0 8px">Your OTP</h2>
      <p style="color:#8B9BBF;font-size:14px;margin:0 0 28px;line-height:1.6">
        ${purpose === "register" ? "Use this code to verify your account." : "Use this code to sign in."}
        Valid for <strong style="color:#F0F4FF">10 minutes</strong>.
      </p>
      <div style="background:#1A2540;border:1px solid #2A3A5C;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px">
        <div style="font-family:'Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:12px;color:#6366F1">${otp}</div>
      </div>
      <p style="color:#5A6A8A;font-size:12px;line-height:1.6;margin:0">
        If you did not request this, ignore this email. Do not share this OTP with anyone.
        ExamShield will never ask for your OTP over phone or chat.
      </p>
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #2A3A5C;font-size:10px;color:#5A6A8A;letter-spacing:0.5px">
        AI flags. Human decides. System executes.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `ExamShield <${process.env.GMAIL_USER}>`,
      to: email,
      subject,
      html,
    });
    return { success: true };
  } catch (err) {
    console.error("[EmailService] Failed to send OTP:", err.message);
    return { success: false, error: err.message };
  }
};

// Sends a student their exam access code — the digital-admit-card equivalent.
// Unlike OTP, this is meant to be saved/printed and held until exam day,
// not used immediately, so the email frames it that way (no urgency language,
// a clear window, and an explicit reminder not to lose it).
const sendExamCode = async (email, { name, examCode, windowStart, windowEnd, rollNumber }) => {
  const subject = `Your ExamShield exam access code`;

  const formatDt = (d) => new Date(d).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;background:#0B1120;color:#F0F4FF;padding:40px;border-radius:12px">
      <div style="font-size:11px;letter-spacing:1.5px;color:#6366F1;margin-bottom:16px">EXAMSHIELD · EXAM ACCESS CODE</div>
      <h2 style="font-size:22px;font-weight:700;margin:0 0 8px">Hi ${name},</h2>
      <p style="color:#8B9BBF;font-size:14px;margin:0 0 24px;line-height:1.6">
        This is your access code for your <strong style="color:#F0F4FF">NEET</strong> exam
        (Roll No. ${rollNumber}). Save or print this email — you will need to type this
        code yourself on the exam center's computer. No phone or personal device will
        be usable inside the center, so there is no OTP step on exam day.
      </p>
      <div style="background:#1A2540;border:1px solid #2A3A5C;border-radius:10px;padding:24px;text-align:center;margin-bottom:20px">
        <div style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#6366F1">${examCode}</div>
      </div>
      <div style="background:#131C2E;border:1px solid #2A3A5C;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#8B9BBF;line-height:1.6">
        <strong style="color:#F0F4FF">Valid window:</strong><br/>
        ${formatDt(windowStart)} — ${formatDt(windowEnd)}
      </div>
      <p style="color:#5A6A8A;font-size:12px;line-height:1.6;margin:0">
        This code works exactly once. Do not share it with anyone — sharing it does not
        let someone "help" you, it lets them take your seat instead of you.
        If you lose this email, contact your coordinator before exam day, not on the day itself.
      </p>
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #2A3A5C;font-size:10px;color:#5A6A8A;letter-spacing:0.5px">
        AI flags. Human decides. System executes.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `ExamShield <${process.env.GMAIL_USER}>`,
      to: email,
      subject,
      html,
    });
    return { success: true };
  } catch (err) {
    console.error("[EmailService] Failed to send exam code:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendOTP, sendExamCode };
