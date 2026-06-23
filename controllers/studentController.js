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
    if (volunteerPost === "Campus Captains") {
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
      const captain = await Student.findOne({
        couponCode: body.usedCouponCode
      });

      if (!captain) {
        return res.status(400).json({
          success: false,
          message: "Invalid referrerCode. No captain found."
        });
      }

      // 4. Link member to coordinator
      body.referredBy = captain._id;
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

// ========================
// GET SINGLE STUDENT BY ID
// ========================
exports.getSingleStudent = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ 
                success: false, 
                msg: "Student ID is required" 
            });
        }
        
        const student = await Student.findById(id);
        
        if (!student) {
            return res.status(404).json({ 
                success: false, 
                msg: "Student not found with the provided ID" 
            });
        }
        
        res.status(200).json({
            success: true,
            data: student
        });
        
    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).json({ 
                success: false, 
                msg: "Invalid student ID format" 
            });
        }
        res.status(500).json({ 
            success: false, 
            msg: err.message 
        });
    }
};

// ========================
// SEARCH STUDENTS BY NAME (Case-insensitive partial match)
// ========================
exports.searchByName = async (req, res) => {
    try {
        const { name } = req.query;

        // Validate query
        if (!name || name.trim() === '') {
            return res.status(400).json({
                success: false,
                message: "Name query parameter is required"
            });
        }

        // Create a case-insensitive regex for partial matching
        const searchRegex = new RegExp(name.trim(), 'i');
        
        // Search for students where fullName matches the regex
        const students = await Student.find({
            fullName: searchRegex
        });

        // If none found
        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No students found with name containing: ${name}`
            });
        }

        // Success
        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ========================
// DELETE STUDENT BY ID
// ========================
exports.deleteStudent = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate if ID is provided
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required"
            });
        }
        
        // Find and delete the student by ID
        const deletedStudent = await Student.findByIdAndDelete(id);
        
        // Check if student exists
        if (!deletedStudent) {
            return res.status(404).json({
                success: false,
                message: "Student not found with the provided ID"
            });
        }
        
        // Check if this student is a Campus Captain with coupon code
        // If so, we should also handle deletion of members linked to this captain
        if (deletedStudent.volunteerPost === "Campus Captains" && deletedStudent.couponCode) {
            // Unlink members who used this coupon code
            await Student.updateMany(
                { usedCouponCode: deletedStudent.couponCode },
                { $unset: { referredBy: "" } }
            );
            
            // Return success with additional info about members unlinked
            return res.status(200).json({
                success: true,
                message: `Student deleted successfully. Members who used coupon code '${deletedStudent.couponCode}' have been unlinked.`,
                data: deletedStudent
            });
        }
        
        // Success response for regular deletion
        res.status(200).json({
            success: true,
            message: "Student deleted successfully",
            data: deletedStudent
        });
        
    } catch (err) {
        // Handle invalid ObjectId format
        if (err.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID format"
            });
        }
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.getStudentByState = async (req, res) => {
    try {
        const students = await Student.find({ stateOrigin: req.params.stateOrigin });
        if (students.length === 0) {
            return res.status(404).json({ msg: "No student found in this state" });
        }
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getStudentByLga = async (req, res) => {
    try {
        const students = await Student.find({ lgaOrigin: req.params.lgaOrigin });
        if (students.length === 0) {
            return res.status(404).json({ msg: "No student found in this Local Government" });
        }
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getStudentBySchool = async (req, res) => {
    try{ 
        const students = await Student.find({ institution: req.params.institution });
        if (students.length === 0) {
            return res.status(404).json({ msg: "No student found in this institution" });
        }
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getStudentByStateResidence = async (req, res) => {
    try {
        const students = await Student.find({ stateResidence: req.params.stateResidence });
        if (students.length === 0) {
            return res.status(404).json({ msg: "No student found in this state of residence" });
        }
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
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
    const captain = await Student.findOne({ couponCode });

    if (!captain) {
      return res.status(404).json({
        success: false,
        message: `No captain found with couponCode: ${couponCode}`,
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
      captain: {
        id: captain._id,
        name: captain.fullName,
        couponCode: captain.couponCode,
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