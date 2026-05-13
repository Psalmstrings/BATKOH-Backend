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

exports.searchByVolunteerPost = async (req, res) => {
  try {
    const { volunteerPost } = req.query;

    // Allowed posts (MUST match your schema)
    const allowedPosts = [
      "Director",
      "State Coordinator",
      "Deputy Coordinator",
      "State Working Committee",
      "Campus Coordinators",
      "Campus Captains",
      "Members"
    ];

    // 1. validate query
    if (!volunteerPost) {
      return res.status(400).json({
        success: false,
        message: "volunteerPost query parameter is required"
      });
    }

    // 2. validate it's one of the allowed values
    if (!allowedPosts.includes(volunteerPost)) {
      return res.status(400).json({
        success: false,
        message: `Invalid volunteerPost. Allowed values: ${allowedPosts.join(", ")}`
      });
    }

    // 3. EXACT FILTER (no regex, no fallback)
    const students = await Student.find({ volunteerPost: volunteerPost });

    // 4. if none found
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No users found with volunteerPost: ${volunteerPost}`,
      });
    }

    // 5. success
    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};