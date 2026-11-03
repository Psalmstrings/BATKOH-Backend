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

// ─── TRUST PROXY (Critical for Render, Heroku, Cloudflare) ────────────────────
// Allows express-rate-limit and req.ip to identify the real client IP via X-Forwarded-For
app.set("trust proxy", 1);

// ─── SECURITY HEADERS (Helmet) ────────────────────────────────────────────────
app.use(helmet());

// ─── CORS — Comprehensive Origin Handler ──────────────────────────────────────
const ALLOWED_ORIGINS = [
  // Production frontend domains
  "https://batkohsa.org",
  "https://www.batkohsa.org",
  "https://batkoh.netlify.app",
  "https://www.batkoh.com",
  "https://batkoh.com",
  "https://batkoh-backend.onrender.com",
  "https://batkoh-frontend.vercel.app",
  // Local development ports
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

const isOriginAllowed = (origin) => {
  if (!origin) return true; // allow mobile apps, curl, server-to-server
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/(.*\.)?batkohsa\.org$/.test(origin)) return true;
  if (/^https?:\/\/(.*\.)?batkoh\.com$/.test(origin)) return true;
  if (/^https?:\/\/[a-zA-Z0-9-]+\.netlify\.app$/.test(origin)) return true;
  if (/^https?:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
};

app.use(
  cors({
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy: origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-app-key"],
    credentials: true,
  })
);

// ─── BODY SIZE LIMIT ──────────────────────────────────────────────────────────
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ─── RATE LIMITERS ────────────────────────────────────────────────────────────
// General API — 2,000 req / 15 min per IP (prevents multi-tab / bulk navigation starvation)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: {
    success: false,
    message: "Too many requests from this network. Please try again after 15 minutes.",
  },
});

// Login endpoints — 120 attempts / 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: {
    success: false,
    message: "Too many login attempts from this network. Please wait a few minutes and try again.",
  },
});

// Registration — 300 registrations / hour per IP
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: {
    success: false,
    message: "Too many registrations from this IP. Please try again after 1 hour.",
  },
});

// Apply general limiter to all routes
app.use(generalLimiter);

// Targeted limiters on sensitive paths (before route mounts)
app.use("/api/students/captain-login", loginLimiter);
app.use("/api/students/coordinator-login", loginLimiter);
app.use("/api/admin/login", loginLimiter);
app.use("/api/students", studentRoutes);
app.use("/api/admin", adminRoutes);

// ─── HEALTH CHECK ROUTE ───────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: "Internal server error" });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
