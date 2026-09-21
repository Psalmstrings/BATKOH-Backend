const express = require("express");
const {
  createStudent,
  getStudents,
  getStudentByLga,
  getStudentBySchool,
  getStudentByState,
  getStudentByStateResidence,
  searchByVolunteerPost,
  getMembersUnderCoordinator,
  getSingleStudent,
  deleteStudent,
  searchByName,
  captainLogin,
  getCaptainMembers,
  updateCaptainMember,
  updateStudentByAdmin,
} = require("../controllers/studentController");
const checkExistingStudent = require("../middlewares/checkExistingStudent");
const { verifyAdmin, verifyCaptain } = require("../middlewares/authMiddleware");

// Registration rate limiter (20 regs / hour per IP)
const rateLimit = require("express-rate-limit");
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many registrations from this IP. Please try again after 1 hour.",
  },
});

const router = express.Router();

// ========================
// ROUTE ORDER MATTERS!
// More specific routes should come BEFORE generic ones
// ========================

// 1. CAMPUS CAPTAIN AUTH & PORTAL ROUTES (public login, protected data)
router.post("/captain-login", captainLogin);
router.get("/captain/members", verifyCaptain, getCaptainMembers);
router.put("/captain/member/:id", verifyCaptain, updateCaptainMember);

// 2. SEARCH ROUTES (admin-only — contains sensitive PII)
router.get("/search/name", verifyAdmin, searchByName);
router.get("/search", verifyAdmin, searchByVolunteerPost);

// 3. MEMBERS ROUTE (admin-only)
router.get("/members", verifyAdmin, getMembersUnderCoordinator);

// 4. FILTER ROUTES (admin-only)
router.get("/state/:stateOrigin", verifyAdmin, getStudentByState);
router.get("/lga/:lgaOrigin", verifyAdmin, getStudentByLga);
router.get("/school/:institution", verifyAdmin, getStudentBySchool);
router.get("/residence/:stateResidence", verifyAdmin, getStudentByStateResidence);

// 5. DYNAMIC PARAMETER ROUTES (admin-only)
router.get("/:id", verifyAdmin, getSingleStudent);
router.put("/:id", verifyAdmin, updateStudentByAdmin);
router.delete("/:id", verifyAdmin, deleteStudent);

// 6. PUBLIC ROUTES
router.post("/", registrationLimiter, checkExistingStudent, createStudent); // rate-limited
router.get("/", verifyAdmin, getStudents); // admin-only: list ALL members

module.exports = router;