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
  searchByName  // Add the new searchByName controller
} = require("../controllers/studentController");
const checkExistingStudent = require("../middlewares/checkExistingStudent");
const router = express.Router();

// ========================
// ROUTE ORDER MATTERS!
// More specific routes should come BEFORE generic ones
// ========================

// 1. SEARCH ROUTES (most specific)
// Search by name - must come before the generic /search route
router.get("/search/name", searchByName);
router.get("/search", searchByVolunteerPost);

// 2. MEMBERS ROUTE (specific query)
router.get("/members", getMembersUnderCoordinator);

// 3. DYNAMIC PARAMETER ROUTES (more specific patterns)
// Get single student by ID - MUST come BEFORE other parameter routes
router.get("/:id", getSingleStudent);

// Delete student by ID
router.delete("/:id", deleteStudent);

// 4. FILTER ROUTES (these should come AFTER the /:id route to prevent conflicts)
// These are specific paths that won't be confused with IDs
router.get("/state/:stateOrigin", getStudentByState);
router.get("/lga/:lgaOrigin", getStudentByLga);
router.get("/school/:institution", getStudentBySchool);
router.get("/residence/:stateResidence", getStudentByStateResidence);

// 5. POST and GET ALL routes (least specific)
router.post("/", checkExistingStudent, createStudent);
router.get("/", getStudents);

module.exports = router;