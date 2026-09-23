const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const connectDB = require("./config/connectToDb");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");

dotenv.config();

// ─── STARTUP GUARD — fail fast if critical env vars are missing ───────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 20) {
  console.error("FATAL: JWT_SECRET is missing or too short in environment variables. Server will not start.");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("FATAL: MONGO_URI is missing in environment variables. Server will not start.");
  process.exit(1);
}

connectDB();


const app = express();

// ─── SECURITY HEADERS (Helmet) ────────────────────────────────────────────────
app.use(helmet());

// ─── CORS — Strict Origin Whitelist ───────────────────────────────────────────
const ALLOWED_ORIGINS = [
  // Production frontend (update with your actual deployed frontend URLs)
  "https://batkoh.netlify.app",
  "https://www.batkoh.com",
  "https://batkoh-backend.onrender.com",
  "https://batkohsa.org",
  "https://batkoh-frontend.vercel.app",
  // Local development
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman during dev)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("CORS policy: origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-app-key"],
    credentials: true,
  })
);

// ─── BODY SIZE LIMIT ──────────────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

// ─── RATE LIMITERS ────────────────────────────────────────────────────────────
// General API — 100 req / 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again after 15 minutes." },
});

// Login endpoints — 10 attempts / 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again after 15 minutes." },
});

// Registration — 200 registrations / hour per IP
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registrations from this IP. Please try again after 1 hour." },
});

// Apply general limiter to all routes
app.use(generalLimiter);

// Targeted limiters on sensitive paths (before route mounts)
app.use("/api/students/captain-login", loginLimiter);
app.use("/api/admin/login", loginLimiter);
app.use("/api/students", studentRoutes);
app.use("/api/admin", adminRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: "Internal server error" });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
