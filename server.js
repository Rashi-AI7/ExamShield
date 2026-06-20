require("dotenv").config();
const express = require("express");
const connectDB = require("./src/config/db");

const app = express();
app.use(express.json());

// Audit logger — must be first, before all routes
app.use(require("./src/middleware/auditLogger"));

// Routes
app.use("/api/auth",      require("./src/routes/auth"));
app.use("/api/questions", require("./src/routes/questions"));
app.use("/api/paper",     require("./src/routes/paper"));
app.use("/api/review",    require("./src/routes/review"));
app.use("/api/admin",     require("./src/routes/admin"));
app.use("/api/transparency", require("./src/routes/transparency")); // public — no auth

connectDB();

app.get("/", (req, res) => {
  res.json({ status: "ExamShield is alive", version: "1.0.0", message: "NTA is scared." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ExamShield running on port ${PORT}`));
