const Student = require("../models/student");

// =====================================================
// CLEAN FIRST NAME
// =====================================================
const getFirstName = (fullName) => {
    return fullName
        .trim()
        .split(/\s+/)[0]
        .replace(/[^a-zA-Z]/g, "");
};


// =====================================================
// RANDOM NUMBER
// =====================================================
const generateRandomNumber = (length = 4) => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;

    return Math.floor(min + Math.random() * (max - min + 1));
};


// =====================================================
// CAMPUS COORDINATOR CODE
// FORMAT: CC-FirstName1234
// Example: CC-John4821
// =====================================================
const generateCampusCoordinatorCode = async (fullName) => {
    const firstName = getFirstName(fullName);

    let code;
    let exists = true;

    while (exists) {
        code = `CC-${firstName}${generateRandomNumber(4)}`;

        exists = await Student.exists({
            couponCode: code
        });
    }

    return code;
};


// =====================================================
// NFSAN COORDINATOR CODE
// FORMAT: FemaleWing763
// =====================================================
const generateNFSANCoordinatorCode = async () => {
    const wings = [
        "FemaleWing"
    ];

    let code;
    let exists = true;

    while (exists) {
        const wing = wings[Math.floor(Math.random() * wings.length)];

        code = `${wing}${generateRandomNumber(3)}`;

        exists = await Student.exists({
            couponCode: code
        });
    }

    return code;
};


// =====================================================
// CAMPUS CAPTAIN CODE
// FORMAT: FirstName1234
// Example: John4821
// =====================================================
const generateCampusCaptainCode = async (fullName) => {
    const firstName = getFirstName(fullName);

    let code;
    let exists = true;

    while (exists) {
        code = `${firstName}${generateRandomNumber(4)}`;

        exists = await Student.exists({
            couponCode: code
        });
    }

    return code;
};


// =====================================================
// CREATE STUDENT
// =====================================================
exports.createStudent = async (req, res) => {
    try {
        const body = { ...req.body };

        const {
            fullName,
            volunteerPost,
            usedCouponCode
        } = body;


        // =================================================
        // BASIC VALIDATION
        // =================================================
        if (!fullName || !volunteerPost) {
            return res.status(400).json({
                success: false,
                message: "Full name and volunteer position are required."
            });
        }


        // =================================================
        // CAMPUS COORDINATOR
        // Automatically gets:
        // CC-FirstName1234
        // =================================================
        if (volunteerPost === "Campus Coordinators") {

            body.couponCode =
                await generateCampusCoordinatorCode(fullName);
        }


        // =================================================
        // NFSAN COORDINATOR
        // Automatically gets:
        // FemaleWing763
        // =================================================
        else if (volunteerPost === "NFSAN Coordinator") {

            body.couponCode =
                await generateNFSANCoordinatorCode();
        }


        // =================================================
        // CAMPUS CAPTAIN
        //
        // Must provide Campus Coordinator code
        // =================================================
        else if (volunteerPost === "Campus Captains") {

            if (!usedCouponCode || usedCouponCode.trim() === "") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Campus Coordinator coupon code is required for Campus Captains."
                });
            }

            const coordinator = await Student.findOne({
                couponCode: usedCouponCode.trim(),
                volunteerPost: "Campus Coordinators"
            });

            if (!coordinator) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid Campus Coordinator coupon code."
                });
            }

            // Generate Captain's own unique code
            body.couponCode =
                await generateCampusCaptainCode(fullName);

            // Store the code they used
            body.usedCouponCode = usedCouponCode.trim();

            // Link captain to coordinator
            body.referredBy = coordinator._id;
        }


        // =================================================
        // MEMBER
        //
        // Member can use:
        // 1. NFSAN Coordinator code
        // OR
        // 2. Campus Captain code
        // =================================================
        else if (volunteerPost === "Members") {

            if (!usedCouponCode || usedCouponCode.trim() === "") {
                return res.status(400).json({
                    success: false,
                    message:
                        "NFSAN Coordinator or Campus Captain code is required for Members."
                });
            }

            const code = usedCouponCode.trim();


            // ---------------------------------------------
            // Check NFSAN Coordinator
            // ---------------------------------------------
            let referrer = await Student.findOne({
                couponCode: code,
                volunteerPost: "NFSAN Coordinator"
            });


            // ---------------------------------------------
            // If not NFSAN Coordinator, check Captain
            // ---------------------------------------------
            if (!referrer) {
                referrer = await Student.findOne({
                    couponCode: code,
                    volunteerPost: "Campus Captains"
                });
            }


            // ---------------------------------------------
            // Invalid code
            // ---------------------------------------------
            if (!referrer) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid code. Please provide a valid NFSAN Coordinator or Campus Captain code."
                });
            }


            // Store the code used
            body.usedCouponCode = code;

            // Link member to referrer
            body.referredBy = referrer._id;
        }


        // =================================================
        // REMOVE EMPTY CODE VALUES
        // =================================================
        if (!body.couponCode) {
            delete body.couponCode;
        }


        // =================================================
        // CREATE STUDENT
        // =================================================
        const student = await Student.create(body);


        // =================================================
        // RESPONSE
        // =================================================
        return res.status(201).json({
            success: true,
            message: "Registration successful.",
            data: student
        });


    } catch (error) {

        console.error("CREATE STUDENT ERROR:", error);


        // MongoDB duplicate key
        if (error.code === 11000) {

            const duplicateField =
                Object.keys(error.keyPattern || {})[0];

            return res.status(409).json({
                success: false,
                message:
                    `A student with this ${duplicateField || "unique field"} already exists.`,
                error: error.message
            });
        }


        return res.status(500).json({
            success: false,
            message: "Server error.",
            error: error.message
        });
    }
};


// =====================================================
// EXPORT GENERATORS IF NEEDED ELSEWHERE
// =====================================================
// exports.generateCampusCoordinatorCode =
//     generateCampusCoordinatorCode;

// exports.generateNFSANCoordinatorCode =
//     generateNFSANCoordinatorCode;

// exports.generateCampusCaptainCode =
//     generateCampusCaptainCode;

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