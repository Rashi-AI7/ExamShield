const mongoose = require("mongoose");
const crypto = require("crypto");

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  otpHash: { type: String, required: true },
  purpose: { type: String, enum: ["register", "login"], required: true },
  pendingData: { type: mongoose.Schema.Types.Mixed, default: null },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
}, { timestamps: true });

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ email: 1, purpose: 1 });

otpSchema.statics.createOTP = async function (email, purpose, pendingData = null) {
  await this.deleteMany({ email, purpose, used: false });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await this.create({ email, otpHash, purpose, pendingData, expiresAt });
  return otp;
};

otpSchema.statics.verifyOTP = async function (email, purpose, otp) {
  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  const record = await this.findOne({ email, purpose, used: false });
  if (!record) return { valid: false, reason: "OTP not found or already used" };
  if (record.expiresAt < new Date()) return { valid: false, reason: "OTP expired — request a new one" };
  if (record.attempts >= 5) return { valid: false, reason: "Too many attempts — request a new OTP" };
  if (record.otpHash !== otpHash) {
    await this.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    const left = 5 - record.attempts - 1;
    return { valid: false, reason: `Incorrect OTP (${left} attempt${left !== 1 ? "s" : ""} remaining)` };
  }
  await this.updateOne({ _id: record._id }, { used: true });
  return { valid: true, pendingData: record.pendingData };
};

module.exports = mongoose.model("OTP", otpSchema);
