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
// FORMAT: DR-FirstName1234
// Example: DR-John4821
// =====================================================
const generateCampusCoordinatorCode = async (fullName) => {
    const firstName = getFirstName(fullName);

    let code;
    let exists = true;

    while (exists) {
        code = `DR-${firstName}${generateRandomNumber(4)}`;

        exists = await Student.exists({
            couponCode: code
        });
    }

    return code;
};


// =====================================================
// CAMPUS CAPTAIN CODE
// FORMAT: NELFUND-1234
// Example: NELFUND-4821
// =====================================================
const generateCampusCaptainCode = async (fullName) => {
    const firstName = getFirstName(fullName);

    let code;
    let exists = true;

    while (exists) {
        code = `NELFUND-${generateRandomNumber(4)}`;

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
        //
        // Automatically gets:
        // DR-FirstName1234
        // =================================================
        if (volunteerPost === "Campus Coordinators") {

            body.couponCode =
                await generateCampusCoordinatorCode(fullName);
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

            // Store the code used
            body.usedCouponCode = usedCouponCode.trim();

            // Link captain to coordinator
            body.referredBy = coordinator._id;
        }


        // =================================================
        // MEMBER
        //
        // Member can use:
        // 1. Campus Coordinator code
        // 2. Campus Captain code
        // 3. NFSAN Coordinator code
        // =================================================
        else if (volunteerPost === "Members") {

            if (!usedCouponCode || usedCouponCode.trim() === "") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Campus Coordinator, Campus Captain or NFSAN Coordinator code is required for Members."
                });
            }

            const code = usedCouponCode.trim();

            let referrer = null;


            // ---------------------------------------------
            // 1. CHECK CAMPUS COORDINATOR
            // ---------------------------------------------
            referrer = await Student.findOne({
                couponCode: code,
                volunteerPost: "Campus Coordinators"
            });


            // ---------------------------------------------
            // 2. IF NOT CAMPUS COORDINATOR,
            //    CHECK CAMPUS CAPTAIN
            // ---------------------------------------------
            if (!referrer) {
                referrer = await Student.findOne({
                    couponCode: code,
                    volunteerPost: "Campus Captains"
                });
            }


            // ---------------------------------------------
            // 3. IF NOT CAMPUS CAPTAIN,
            //    CHECK NFSAN COORDINATOR
            // ---------------------------------------------
            if (!referrer) {
                referrer = await Student.findOne({
                    couponCode: code,
                    volunteerPost: "NFSAN Coordinator"
                });
            }


            // ---------------------------------------------
            // 4. INVALID CODE
            // ---------------------------------------------
            if (!referrer) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid code. Please provide a valid Campus Coordinator, Campus Captain or NFSAN Coordinator code."
                });
            }


            // ---------------------------------------------
            // STORE THE CODE USED
            // ---------------------------------------------
            body.usedCouponCode = code;


            // ---------------------------------------------
            // LINK MEMBER TO REFERRER
            // ---------------------------------------------
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


        // =================================================
        // MONGODB DUPLICATE KEY
        // =================================================
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


        // =================================================
        // SERVER ERROR
        // =================================================
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


// =====================================================
// GET ALL STUDENTS
// =====================================================
exports.getStudents = async (req, res) => {
    try {

        const students = await Student.find();

        res.json(students);

    } catch (err) {

        res.status(500).json({
            msg: err.message
        });
    }
};


// =====================================================
// GET SINGLE STUDENT BY ID
// =====================================================
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

        if (err.name === "CastError") {
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


// =====================================================
// SEARCH STUDENTS BY NAME
// Case-insensitive partial match
// =====================================================
exports.searchByName = async (req, res) => {
    try {

        const { name } = req.query;

        if (!name || name.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Name query parameter is required"
            });
        }

        const searchRegex = new RegExp(name.trim(), "i");

        const students = await Student.find({
            fullName: searchRegex
        });

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    `No students found with name containing: ${name}`
            });
        }

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


// =====================================================
// DELETE STUDENT BY ID
// =====================================================
exports.deleteStudent = async (req, res) => {
    try {

        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required"
            });
        }

        const deletedStudent =
            await Student.findByIdAndDelete(id);

        if (!deletedStudent) {
            return res.status(404).json({
                success: false,
                message: "Student not found with the provided ID"
            });
        }


        // =================================================
        // HANDLE CAMPUS CAPTAIN DELETION
        // =================================================
        if (
            deletedStudent.volunteerPost === "Campus Captains" &&
            deletedStudent.couponCode
        ) {

            await Student.updateMany(
                {
                    usedCouponCode:
                        deletedStudent.couponCode
                },
                {
                    $unset: {
                        referredBy: ""
                    }
                }
            );

            return res.status(200).json({
                success: true,
                message:
                    `Student deleted successfully. Members who used coupon code '${deletedStudent.couponCode}' have been unlinked.`,
                data: deletedStudent
            });
        }


        // =================================================
        // REGULAR DELETION
        // =================================================
        res.status(200).json({
            success: true,
            message: "Student deleted successfully",
            data: deletedStudent
        });

    } catch (err) {

        if (err.name === "CastError") {
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


// =====================================================
// GET STUDENTS BY STATE OF ORIGIN
// =====================================================
exports.getStudentByState = async (req, res) => {
    try {

        const students = await Student.find({
            stateOrigin: req.params.stateOrigin
        });

        if (students.length === 0) {
            return res.status(404).json({
                msg: "No student found in this state"
            });
        }

        res.json(students);

    } catch (err) {

        res.status(500).json({
            msg: err.message
        });
    }
};


// =====================================================
// GET STUDENTS BY LGA
// =====================================================
exports.getStudentByLga = async (req, res) => {
    try {

        const students = await Student.find({
            lgaOrigin: req.params.lgaOrigin
        });

        if (students.length === 0) {
            return res.status(404).json({
                msg: "No student found in this Local Government"
            });
        }

        res.json(students);

    } catch (err) {

        res.status(500).json({
            msg: err.message
        });
    }
};


// =====================================================
// GET STUDENTS BY INSTITUTION
// =====================================================
exports.getStudentBySchool = async (req, res) => {
    try {

        const students = await Student.find({
            institution: req.params.institution
        });

        if (students.length === 0) {
            return res.status(404).json({
                msg: "No student found in this institution"
            });
        }

        res.json(students);

    } catch (err) {

        res.status(500).json({
            msg: err.message
        });
    }
};


// =====================================================
// GET STUDENTS BY STATE OF RESIDENCE
// =====================================================
exports.getStudentByStateResidence = async (req, res) => {
    try {

        const students = await Student.find({
            stateResidence: req.params.stateResidence
        });

        if (students.length === 0) {
            return res.status(404).json({
                msg: "No student found in this state of residence"
            });
        }

        res.json(students);

    } catch (err) {

        res.status(500).json({
            msg: err.message
        });
    }
};


// =====================================================
// SEARCH STUDENTS BY VOLUNTEER POST
// =====================================================
exports.searchByVolunteerPost = async (req, res) => {

    try {

        const { volunteerPost } = req.query;


        // =================================================
        // ALLOWED POSTS
        // =================================================
        const allowedPosts = [
            "Director",
            "State Coordinator",
            "Deputy Coordinator",
            "State Working Committee",
            "Campus Coordinators",
            "Campus Captains",
            "Members"
        ];


        // =================================================
        // VALIDATE QUERY
        // =================================================
        if (!volunteerPost) {
            return res.status(400).json({
                success: false,
                message:
                    "volunteerPost query parameter is required"
            });
        }


        // =================================================
        // VALIDATE POST
        // =================================================
        if (!allowedPosts.includes(volunteerPost)) {
            return res.status(400).json({
                success: false,
                message:
                    `Invalid volunteerPost. Allowed values: ${allowedPosts.join(", ")}`
            });
        }


        // =================================================
        // EXACT FILTER
        // =================================================
        const students = await Student.find({
            volunteerPost: volunteerPost
        });


        // =================================================
        // NO RESULTS
        // =================================================
        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    `No users found with volunteerPost: ${volunteerPost}`
            });
        }


        // =================================================
        // SUCCESS
        // =================================================
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


// =====================================================
// GET MEMBERS UNDER COORDINATOR / CAPTAIN / REFERRER
// =====================================================
exports.getMembersUnderCoordinator = async (req, res) => {

    try {

        const { couponCode } = req.query;


        // =================================================
        // VALIDATE QUERY
        // =================================================
        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message:
                    "couponCode query parameter is required"
            });
        }


        // =================================================
        // FIND OWNER OF COUPON
        // =================================================
        const referrer = await Student.findOne({
            couponCode: couponCode.trim()
        });


        if (!referrer) {
            return res.status(404).json({
                success: false,
                message:
                    `No coordinator, captain or NFSAN coordinator found with couponCode: ${couponCode}`
            });
        }


        // =================================================
        // FIND MEMBERS WHO USED THIS COUPON
        // =================================================
        const members = await Student.find({
            usedCouponCode: couponCode.trim()
        });


        if (members.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    `No members found who used couponCode: ${couponCode}`
            });
        }


        // =================================================
        // SUCCESS
        // =================================================
        res.status(200).json({
            success: true,

            referrer: {
                id: referrer._id,
                name: referrer.fullName,
                volunteerPost: referrer.volunteerPost,
                couponCode: referrer.couponCode
            },

            count: members.length,

            members
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

