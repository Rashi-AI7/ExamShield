const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8 },

    // Roles:
    //   student    — can fetch/submit their own paper only
    //   coordinator — manages question bank, reviews flagged papers
    //   admin      — full access, can create users
    role: {
      type: String,
      enum: ["student", "coordinator", "admin"],
      default: "student",
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hash password before save — never store plaintext
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare candidate password with stored hash
userSchema.methods.verifyPassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never return password in JSON responses
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);