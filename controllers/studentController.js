const Student = require("../models/student");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// =====================================================
// STRICT VIN REGEX — Two accepted INEC formats:
// Format A: INC + 17 digits  (e.g. INC26000000044392309)
// Format B: 2digits+letter+digit+B+3digits+2letters+9digits (e.g. 90F5B126FC515580873)
// =====================================================



// =====================================================
// CLEAN FIRST NAME
// =====================================================
const getFirstName = (fullName) => {
    if (!fullName) return "";
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
// FORMAT: FirstName123 (e.g. JOHN482)
// Firstname + 3 random codes
// =====================================================
const generateCampusCaptainCode = async (fullName) => {
    const rawFirstName = getFirstName(fullName).toUpperCase();
    const firstName = rawFirstName || "CAP";

    let code;
    let exists = true;

    while (exists) {
        code = `${firstName}${generateRandomNumber(3)}`;

        exists = await Student.exists({
            couponCode: code
        });
    }

    return code;
};

// =====================================================
// STAFF CAPTAIN CODE
// FORMAT: STAFF-1234 (e.g. STAFF-4821)
// =====================================================
const generateStaffCaptainCode = async () => {
    let code;
    let exists = true;

    while (exists) {
        code = `STAFF-${generateRandomNumber(4)}`;

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
        // Admin can register without coupon code.
        // If coordinator code is provided, links captain to coordinator.
        // Generates Captain code: FirstName + 3 random digits
        // =================================================
        else if (volunteerPost === "Campus Captains") {

            if (usedCouponCode && usedCouponCode.trim() !== "") {
                const coordinator = await Student.findOne({
                    couponCode: usedCouponCode.trim().toUpperCase(),
                    volunteerPost: "Campus Coordinators"
                });

                if (!coordinator) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid Campus Coordinator coupon code."
                    });
                }

                body.usedCouponCode = usedCouponCode.trim().toUpperCase();
                body.referredBy = coordinator._id;
            } else {
                delete body.usedCouponCode;
            }

            // Generate Captain's own unique code (FirstName + 3 random codes)
            body.couponCode =
                await generateCampusCaptainCode(fullName);
        }


        // =================================================
        // STAFF CAPTAIN
        //
        // Admin can register without coupon code.
        // Generates Staff Captain code: STAFF-XXXX
        // =================================================
        else if (volunteerPost === "Staff Captains") {

            if (usedCouponCode && usedCouponCode.trim() !== "") {
                body.usedCouponCode = usedCouponCode.trim().toUpperCase();
            } else {
                delete body.usedCouponCode;
            }

            // Generate Staff Captain's own unique code
            body.couponCode =
                await generateStaffCaptainCode();
        }


        // =================================================
        // MEMBERS / STUDENTS / STAFF
        //
        // Can use:
        // 1. Campus Coordinator code (e.g. DR-John4821)
        // 2. Campus Captain code (e.g. JOHN482)
        // 3. Staff Captain code (e.g. STAFF-1234)
        // 4. NFSAN Coordinator code (legacy)
        // =================================================
        else if (
            volunteerPost === "Members" ||
            volunteerPost === "Student" ||
            volunteerPost === "Staff" ||
            volunteerPost === "NFSAN Member"
        ) {

            if (!usedCouponCode || usedCouponCode.trim() === "") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Referral coupon code is required for Student and Staff registration."
                });
            }

            const code = usedCouponCode.trim().toUpperCase();

            let referrer = null;


            // ---------------------------------------------
            // 1. CHECK CAMPUS COORDINATOR
            // ---------------------------------------------
            referrer = await Student.findOne({
                couponCode: code,
                volunteerPost: "Campus Coordinators"
            });


            // ---------------------------------------------
            // 2. CHECK CAMPUS CAPTAIN
            // ---------------------------------------------
            if (!referrer) {
                referrer = await Student.findOne({
                    couponCode: code,
                    volunteerPost: "Campus Captains"
                });
            }


            // ---------------------------------------------
            // 3. CHECK STAFF CAPTAIN
            // ---------------------------------------------
            if (!referrer) {
                referrer = await Student.findOne({
                    couponCode: code,
                    volunteerPost: "Staff Captains"
                });
            }


            // ---------------------------------------------
            // 4. CHECK NFSAN COORDINATOR (legacy)
            // ---------------------------------------------
            if (!referrer) {
                referrer = await Student.findOne({
                    couponCode: code,
                    volunteerPost: "NFSAN Coordinator"
                });
            }


            // ---------------------------------------------
            // 5. INVALID CODE
            // ---------------------------------------------
            if (!referrer) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid code. Please provide a valid Campus Coordinator, Campus Captain, or Staff Captain code."
                });
            }


            // ---------------------------------------------
            // STORE THE CODE USED & LINK REFERRER
            // ---------------------------------------------
            body.usedCouponCode = code;
            body.referredBy = referrer._id;
        }

        // =================================================
        // PVC & VIN HANDLING & STRICT VALIDATION
        // =================================================
        const hasPvcValue =
            body.hasPvc === true ||
            body.hasPvc === "true" ||
            body.hasPvc === "Yes" ||
            body.receivedBursary === true ||
            body.receivedBursary === "true";

        body.hasPvc = hasPvcValue;
        body.receivedBursary = hasPvcValue;

            if (body.vin && typeof body.vin === "string") {
            body.vin = body.vin.trim().toUpperCase();

            if (body.vin !== "") {
                if (!/^[A-Z0-9]{17,20}$/.test(body.vin)) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid Voter Identification Number (VIN). VIN must contain only letters and numbers and be between 17 and 20 characters."
                    });
                }
            } else {
                delete body.vin;
            }
        } else {
            delete body.vin;
        }

        if (body.hasPvc && !body.vin) {
            return res.status(400).json({
                success: false,
                message:
                    "Voter Identification Number (VIN) is required when you have a Permanent Voter's Card."
            });
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
        // HANDLE CAPTAIN DELETION (Campus or Staff Captain)
        // =================================================
        if (
            ["Campus Captains", "Staff Captains"].includes(deletedStudent.volunteerPost) &&
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
                    `Captain deleted successfully. Members who used coupon code '${deletedStudent.couponCode}' have been unlinked.`,
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
            "Staff Captains",
            "Members",
            "Student",
            "Staff",
            "NFSAN Member"
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


// =====================================================
// CAMPUS CAPTAIN LOGIN
// Login using registered email and First Name as password
// =====================================================
exports.captainLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const captain = await Student.findOne({
            email: normalizedEmail,
            volunteerPost: { $in: ["Campus Captains", "Staff Captains"] }
        });

        if (!captain) {
            return res.status(401).json({
                success: false,
                message: "No registered Captain found with this email address."
            });
        }

        let isPasswordValid = false;

        // If custom password was set, verify with bcrypt
        if (captain.password) {
            isPasswordValid = await bcrypt.compare(password, captain.password);
        } else {
            // Default password: exact or case-insensitive first name
            const firstName = getFirstName(captain.fullName);
            isPasswordValid = password.trim().toLowerCase() === firstName.toLowerCase();
        }

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Incorrect password. (Initial password is your First Name)."
            });
        }

        // Generate JWT token for Captain
        const token = jwt.sign(
            { id: captain._id, role: "captain", couponCode: captain.couponCode },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.status(200).json({
            success: true,
            message: "Captain login successful.",
            token,
            captain: {
                id: captain._id,
                fullName: captain.fullName,
                email: captain.email,
                phone: captain.phone,
                institution: captain.institution,
                couponCode: captain.couponCode,
                volunteerPost: captain.volunteerPost
            }
        });

    } catch (error) {
        console.error("CAPTAIN LOGIN ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error during login.",
            error: error.message
        });
    }
};


// =====================================================
// GET MEMBERS UNDER LOGGED-IN CAPTAIN
// =====================================================
exports.getCaptainMembers = async (req, res) => {
    try {
        const captain = req.captain;

        if (!captain || !captain.couponCode) {
            return res.status(400).json({
                success: false,
                message: "Captain profile or coupon code is missing."
            });
        }

        // Members who registered with this captain's coupon code
        const members = await Student.find({
            $or: [
                { usedCouponCode: captain.couponCode },
                { referredBy: captain._id }
            ]
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: members.length,
            captain: {
                id: captain._id,
                fullName: captain.fullName,
                email: captain.email,
                institution: captain.institution,
                couponCode: captain.couponCode
            },
            members
        });

    } catch (error) {
        console.error("GET CAPTAIN MEMBERS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve members.",
            error: error.message
        });
    }
};


// =====================================================
// CAPTAIN UPDATE MEMBER DETAILS & VIN
// =====================================================
exports.updateCaptainMember = async (req, res) => {
    try {
        const { id } = req.params;
        const captain = req.captain;
        const updates = req.body;

        const member = await Student.findById(id);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: "Member not found."
            });
        }

        // Verify that this member belongs to this captain
        const isReferredByCaptain =
            member.usedCouponCode === captain.couponCode ||
            (member.referredBy && String(member.referredBy) === String(captain._id));

        if (!isReferredByCaptain) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized: You can only update members registered under your coupon code."
            });
        }

        // Validate VIN if provided
        if (updates.vin !== undefined) {
            if (updates.vin && typeof updates.vin === "string") {
                const cleanVin = updates.vin.trim().toUpperCase();
                if (cleanVin !== "") {
                    if (!STRICT_VIN_REGEX.test(cleanVin)) {
                        return res.status(400).json({
                            success: false,
                            message: "Invalid Voter Identification Number (VIN). Must be exactly 19 uppercase alphanumeric characters (0-9, A-Z)."
                        });
                    }
                    member.vin = cleanVin;
                    member.hasPvc = true;
                    member.receivedBursary = true;
                } else {
                    member.vin = undefined;
                }
            } else {
                member.vin = undefined;
            }
        }

        // Allow updates to other member fields
        if (updates.fullName) member.fullName = updates.fullName.trim();
        if (updates.phone) member.phone = updates.phone.trim();
        if (updates.course) member.course = updates.course.trim();
        if (updates.institution) member.institution = updates.institution;
        if (updates.lgaOrigin) member.lgaOrigin = updates.lgaOrigin.trim();
        if (updates.stateOrigin) member.stateOrigin = updates.stateOrigin.trim();
        if (updates.stateResidence) member.stateResidence = updates.stateResidence.trim();
        if (updates.address) member.address = updates.address.trim();
        if (updates.gender) member.gender = updates.gender;
        if (updates.hasPvc !== undefined) {
            const hasPvcBool = updates.hasPvc === true || updates.hasPvc === "true" || updates.hasPvc === "Yes";
            member.hasPvc = hasPvcBool;
            member.receivedBursary = hasPvcBool;
        }

        await member.save();

        return res.status(200).json({
            success: true,
            message: "Member details updated successfully.",
            data: member
        });

    } catch (error) {
        console.error("UPDATE CAPTAIN MEMBER ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update member details.",
            error: error.message
        });
    }
};


// =====================================================
// ADMIN UPDATE ANY STUDENT / COORDINATOR
// =====================================================
exports.updateStudentByAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student record not found."
            });
        }

        // Validate VIN if provided
        if (updates.vin !== undefined) {
            if (updates.vin && typeof updates.vin === "string") {
                const cleanVin = updates.vin.trim().toUpperCase();
                if (cleanVin !== "") {
                    if (!STRICT_VIN_REGEX.test(cleanVin)) {
                        return res.status(400).json({
                            success: false,
                            message: "Invalid Voter Identification Number (VIN). Must be exactly 19 uppercase alphanumeric characters (0-9, A-Z)."
                        });
                    }
                    student.vin = cleanVin;
                    student.hasPvc = true;
                    student.receivedBursary = true;
                } else {
                    student.vin = undefined;
                }
            } else {
                student.vin = undefined;
            }
        }

        // Apply editable fields
        const allowedFields = [
            "fullName", "email", "phone", "gender", "dob",
            "institution", "course", "volunteerPost", "couponCode",
            "usedCouponCode", "lgaOrigin", "stateOrigin",
            "stateResidence", "address", "hasPvc", "receivedBursary"
        ];

        allowedFields.forEach((field) => {
            if (updates[field] !== undefined) {
                if (field === "hasPvc" || field === "receivedBursary") {
                    const boolVal = updates[field] === true || updates[field] === "true" || updates[field] === "Yes";
                    student.hasPvc = boolVal;
                    student.receivedBursary = boolVal;
                } else if (typeof updates[field] === "string") {
                    student[field] = updates[field].trim();
                } else {
                    student[field] = updates[field];
                }
            }
        });

        await student.save();

        return res.status(200).json({
            success: true,
            message: "Record updated successfully.",
            data: student
        });

    } catch (error) {
        console.error("ADMIN UPDATE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update record.",
            error: error.message
        });
    }
};


