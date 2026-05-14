const express = require("express");
const {
  createStudent,
  getStudents,
  getStudentByLga,
  getStudentBySchool,
  getStudentByState,
  getStudentByStateResidence,
  searchByVolunteerPost,
    getMembersUnderCoordinator
} = require("../controllers/studentController");
const checkExistingStudent = require("../middlewares/checkExistingStudent");
const router = express.Router();

// PUT THIS FIRST so it does not get overridden
router.get("/search", searchByVolunteerPost);

router.post("/", checkExistingStudent, createStudent);
router.get("/members", getMembersUnderCoordinator);
router.get("/", getStudents);
router.get("/state/:stateOrigin", getStudentByState);
router.get("/lga/:lgaOrigin", getStudentByLga);
router.get("/school/:institution", getStudentBySchool);
router.get("/residence/:stateResidence", getStudentByStateResidence);

module.exports = router;