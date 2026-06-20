const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ── authenticate ──────────────────────────────────────────────────────────────
// Verifies the JWT in the Authorization header.
// On success: attaches req.user = { id, email, role }
// On failure: 401

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user to confirm they're still active (handles deactivated accounts)
    const user = await User.findById(decoded.id).select("-password");
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Account not found or deactivated" });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired — please log in again" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ── authorize ─────────────────────────────────────────────────────────────────
// Role gate. Use after authenticate.
// Usage: router.get("/route", authenticate, authorize("coordinator", "admin"), handler)

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied — requires role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize };