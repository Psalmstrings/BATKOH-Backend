const express = require("express");
const { createStudent, getStudents, getStudentByLga, getStudentBySchool, getStudentByState, getStudentByStateResidence } = require("../controllers/studentController");
const checkExistingStudent = require("../middlewares/checkExistingStudent");
const router = express.Router();

router.post("/", checkExistingStudent, createStudent);
router.get("/", getStudents);
router.get("/state/:stateOrigin", getStudentByState);
router.get("/lga/:lgaOrigin", getStudentByLga);
router.get("/school/:institution", getStudentBySchool);
router.get("/residence/:stateResidence", getStudentByStateResidence);

module.exports = router;
