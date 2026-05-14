const Student = require("../models/student");
const crypto = require("crypto");

// Function to generate coupon codes
const generateCoupon = (fullName) => {
    // Extract first name only
    const firstName = fullName.split(" ")[0].toUpperCase();

    // Generate 4 random digits
    const randomDigits = Math.floor(1000 + Math.random() * 9000);

    return `${firstName}${randomDigits}`;
};

exports.createStudent = async (req, res) => {
  try {
    const body = req.body;
    const volunteerPost = body.volunteerPost;

    // Normalize input
    if (body.usedCouponCode) {
      body.usedCouponCode = body.usedCouponCode.trim().toUpperCase();
    }

    // 1. Campus Coordinator → generate coupon
    if (volunteerPost === "Campus Coordinators") {
      body.couponCode = generateCoupon(body.fullName);
    }

    // 2. Members MUST provide coupon code
    if (volunteerPost === "Members") {

      if (!body.usedCouponCode) {
        return res.status(400).json({
          success: false,
          message: "referrerCode is required for members"
        });
      }

      // 3. Find coordinator by couponCode
      const coordinator = await Student.findOne({
        couponCode: body.usedCouponCode
      });

      if (!coordinator) {
        return res.status(400).json({
          success: false,
          message: "Invalid referrerCode. No coordinator found."
        });
      }

      // 4. Link member to coordinator
      body.referredBy = coordinator._id;
    }

    // 5. Create student
    const student = await Student.create(body);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      data: student
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
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

exports.getMembersUnderCoordinator = async (req, res) => {
  try {
    const { couponCode } = req.query;

    // 1. Validate query
    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: "couponCode query parameter is required",
      });
    }

    // 2. Find coordinator with this coupon
    const coordinator = await Student.findOne({ couponCode });

    if (!coordinator) {
      return res.status(404).json({
        success: false,
        message: `No coordinator found with couponCode: ${couponCode}`,
      });
    }

    // 3. Find members who used this coupon
    const members = await Student.find({ usedCouponCode: couponCode });

    if (members.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No members found who used couponCode: ${couponCode}`,
      });
    }

    // 4. Success
    res.status(200).json({
      success: true,
      coordinator: {
        id: coordinator._id,
        name: coordinator.fullName,
        couponCode: coordinator.couponCode,
      },
      count: members.length,
        members,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};