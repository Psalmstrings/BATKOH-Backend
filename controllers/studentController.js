const Student = require("../models/student");

exports.createStudent = async (req, res) => {
  try {
    const student = await Student.create(req.body);

    res.status(201).json({
      status: "success",
      data: student
    });

  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
};


exports.getStudents = async (req, res) => {
    try {
        const students = await Student.find();
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getStudentByState = async (req, res) => {
    try {
        const students = await Student.find({ stateOrigin: req.params.stateOrigin });
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: "No student in this state" });
    }
};

exports.getStudentByLga = async (req, res) => {
    try {
        const students = await Student.find({ lgaOrigin: req.params.lgaOrigin });
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: "No student in this Local Government" });
    }
};

exports.getStudentBySchool = async (req, res) => {
    try{ 
        const students = await Student.find({ institution: req.params.institution });
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: "No student in this institution" });
    }
};

exports.getStudentByStateResidence = async (req, res) => {
    try {
        const students = await Student.find({ stateResidence: req.params.stateResidence });
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: "No student in this state of residence" });
    }
};