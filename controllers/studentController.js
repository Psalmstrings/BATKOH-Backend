const Student = require("../models/student");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

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
// CAMPUS COORDINATOR CODE  →  DR-FirstName1234
// =====================================================
const generateCampusCoordinatorCode = async (fullName) => {
    const firstName = getFirstName(fullName);
    let code;
    let exists = true;
    while (exists) {
        code = `DR-${firstName}${generateRandomNumber(4)}`;
        exists = await Student.exists({ couponCode: code });
    }
    return code;
};


// =====================================================
// CAMPUS CAPTAIN CODE  →  FirstName123
// =====================================================
const generateCampusCaptainCode = async (fullName) => {
    const rawFirstName = getFirstName(fullName).toUpperCase();
    const firstName = rawFirstName || "CAP";
    let code;
    let exists = true;
    while (exists) {
        code = `${firstName}${generateRandomNumber(3)}`;
        exists = await Student.exists({ couponCode: code });
    }
    return code;
};

// =====================================================
// STAFF CAPTAIN CODE  →  STAFF-1234
// =====================================================
const generateStaffCaptainCode = async () => {
    let code;
    let exists = true;
    while (exists) {
        code = `STAFF-${generateRandomNumber(4)}`;
        exists = await Student.exists({ couponCode: code });
    }
    return code;
};


// =====================================================
// HELPER — VIN DUPLICATE CHECK
// Checks whether a VIN is already used by another student.
// excludeId: the current student's _id (so editing own record is fine)
// =====================================================
const isVinTaken = async (vin, excludeId = null) => {
    const clean = vin.trim().toUpperCase();
    if (!clean) return false;
    const query = { vin: clean };
    if (excludeId) query._id = { $ne: excludeId };
    return !!(await Student.findOne(query).select("_id").lean());
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
        // =================================================
        if (volunteerPost === "Campus Coordinators") {
            body.couponCode = await generateCampusCoordinatorCode(fullName);
        }


        // =================================================
        // CAMPUS CAPTAIN
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
                        message: "Invalid Campus Coordinator coupon code."
                    });
                }

                body.usedCouponCode = usedCouponCode.trim().toUpperCase();
                body.referredBy = coordinator._id;
            } else {
                delete body.usedCouponCode;
            }

            body.couponCode = await generateCampusCaptainCode(fullName);
        }


        // =================================================
        // STAFF CAPTAIN
        // =================================================
        else if (volunteerPost === "Staff Captains") {

            if (usedCouponCode && usedCouponCode.trim() !== "") {
                body.usedCouponCode = usedCouponCode.trim().toUpperCase();
            } else {
                delete body.usedCouponCode;
            }

            body.couponCode = await generateStaffCaptainCode();
        }


        // =================================================
        // MEMBERS / STUDENTS / STAFF
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

            referrer = await Student.findOne({ couponCode: code, volunteerPost: "Campus Coordinators" });
            if (!referrer) referrer = await Student.findOne({ couponCode: code, volunteerPost: "Campus Captains" });
            if (!referrer) referrer = await Student.findOne({ couponCode: code, volunteerPost: "Staff Captains" });
            if (!referrer) referrer = await Student.findOne({ couponCode: code, volunteerPost: "NFSAN Coordinator" });

            if (!referrer) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid code. Please provide a valid Campus Coordinator, Campus Captain, or Staff Captain code."
                });
            }

            body.usedCouponCode = code;
            body.referredBy = referrer._id;
        }

        // =================================================
        // PVC & VIN HANDLING
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

                // VIN uniqueness check at application level
                if (await isVinTaken(body.vin)) {
                    return res.status(409).json({
                        success: false,
                        message: "This VIN is already registered to another member."
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
        // REMOVE EMPTY COUPON VALUES
        // =================================================
        if (!body.couponCode) {
            delete body.couponCode;
        }

        // =================================================
        // CREATE STUDENT
        // =================================================
        const student = await Student.create(body);

        return res.status(201).json({
            success: true,
            message: "Registration successful.",
            data: student
        });


    } catch (error) {

        console.error("CREATE STUDENT ERROR:", error);

        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern || {})[0];

            if (duplicateField === "vin") {
                return res.status(409).json({
                    success: false,
                    message: "This VIN is already registered to another member.",
                    error: error.message
                });
            }

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
// GET ALL STUDENTS
// =====================================================
exports.getStudents = async (req, res) => {
    try {
        const students = await Student.find();
        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};


// =====================================================
// GET SINGLE STUDENT BY ID
// =====================================================
exports.getSingleStudent = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ success: false, msg: "Student ID is required" });
        }

        const student = await Student.findById(id);

        if (!student) {
            return res.status(404).json({ success: false, msg: "Student not found with the provided ID" });
        }

        res.status(200).json({ success: true, data: student });

    } catch (err) {
        if (err.name === "CastError") {
            return res.status(400).json({ success: false, msg: "Invalid student ID format" });
        }
        res.status(500).json({ success: false, msg: err.message });
    }
};


// =====================================================
// SEARCH STUDENTS BY NAME
// =====================================================
exports.searchByName = async (req, res) => {
    try {
        const { name } = req.query;

        if (!name || name.trim() === "") {
            return res.status(400).json({ success: false, message: "Name query parameter is required" });
        }

        const searchRegex = new RegExp(name.trim(), "i");
        const students = await Student.find({ fullName: searchRegex });

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No students found with name containing: ${name}`
            });
        }

        res.status(200).json({ success: true, count: students.length, data: students });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};


// =====================================================
// DELETE STUDENT BY ID
// =====================================================
exports.deleteStudent = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ success: false, message: "Student ID is required" });
        }

        const deletedStudent = await Student.findByIdAndDelete(id);

        if (!deletedStudent) {
            return res.status(404).json({
                success: false,
                message: "Student not found with the provided ID"
            });
        }

        // If captain deleted — unlink their members
        if (
            ["Campus Captains", "Staff Captains"].includes(deletedStudent.volunteerPost) &&
            deletedStudent.couponCode
        ) {
            await Student.updateMany(
                { usedCouponCode: deletedStudent.couponCode },
                { $unset: { referredBy: "" } }
            );

            return res.status(200).json({
                success: true,
                message: `Captain deleted successfully. Members who used coupon code '${deletedStudent.couponCode}' have been unlinked.`,
                data: deletedStudent
            });
        }

        res.status(200).json({ success: true, message: "Student deleted successfully", data: deletedStudent });

    } catch (err) {
        if (err.name === "CastError") {
            return res.status(400).json({ success: false, message: "Invalid student ID format" });
        }
        res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
};


// =====================================================
// GET STUDENTS BY STATE OF REGISTRATION
// =====================================================
exports.getStudentByState = async (req, res) => {
    try {
        const students = await Student.find({ stateOfRegistration: req.params.stateOfRegistration });

        if (students.length === 0) {
            return res.status(404).json({ msg: "No student found in this state" });
        }

        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};


// =====================================================
// GET STUDENTS BY LGA OF REGISTRATION
// =====================================================
exports.getStudentByLga = async (req, res) => {
    try {
        const students = await Student.find({ lgaOfRegistration: req.params.lgaOfRegistration });

        if (students.length === 0) {
            return res.status(404).json({ msg: "No student found in this Local Government" });
        }

        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};


// =====================================================
// GET STUDENTS BY INSTITUTION
// =====================================================
exports.getStudentBySchool = async (req, res) => {
    try {
        const students = await Student.find({ institution: req.params.institution });

        if (students.length === 0) {
            return res.status(404).json({ msg: "No student found in this institution" });
        }

        res.json(students);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};


// =====================================================
// GET STUDENTS BY STATE OF RESIDENCE
// =====================================================
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


// =====================================================
// SEARCH STUDENTS BY VOLUNTEER POST
// =====================================================
exports.searchByVolunteerPost = async (req, res) => {
    try {
        const { volunteerPost } = req.query;

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

        if (!volunteerPost) {
            return res.status(400).json({
                success: false,
                message: "volunteerPost query parameter is required"
            });
        }

        if (!allowedPosts.includes(volunteerPost)) {
            return res.status(400).json({
                success: false,
                message: `Invalid volunteerPost. Allowed values: ${allowedPosts.join(", ")}`
            });
        }

        const students = await Student.find({ volunteerPost });

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No users found with volunteerPost: ${volunteerPost}`
            });
        }

        res.status(200).json({ success: true, count: students.length, data: students });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};


// =====================================================
// GET MEMBERS UNDER COORDINATOR / CAPTAIN / REFERRER
// =====================================================
exports.getMembersUnderCoordinator = async (req, res) => {
    try {
        const { couponCode } = req.query;

        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: "couponCode query parameter is required"
            });
        }

        const referrer = await Student.findOne({ couponCode: couponCode.trim() });

        if (!referrer) {
            return res.status(404).json({
                success: false,
                message: `No coordinator, captain or NFSAN coordinator found with couponCode: ${couponCode}`
            });
        }

        const members = await Student.find({ usedCouponCode: couponCode.trim() });

        if (members.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No members found who used couponCode: ${couponCode}`
            });
        }

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
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};


// =====================================================
// CAMPUS CAPTAIN LOGIN
// Credentials: email + firstname (case-insensitive)
// Both Campus Captains and Staff Captains use this route.
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
            // Default password: first name (case-insensitive)
            const firstName = getFirstName(captain.fullName);
            isPasswordValid = password.trim().toLowerCase() === firstName.toLowerCase();
        }

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Incorrect password. Your initial password is your First Name."
            });
        }

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
                couponCode: captain.couponCode,
                volunteerPost: captain.volunteerPost
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
// CAPTAIN UPDATE MEMBER DETAILS
// Only allows updating members that belong to the logged-in captain.
// =====================================================
exports.updateCaptainMember = async (req, res) => {
    try {
        const { id } = req.params;
        const captain = req.captain;
        const updates = req.body;

        const member = await Student.findById(id);
        if (!member) {
            return res.status(404).json({ success: false, message: "Member not found." });
        }

        // ── Ownership check (backend-enforced) ──
        const isOwnMember =
            member.usedCouponCode === captain.couponCode ||
            (member.referredBy && String(member.referredBy) === String(captain._id));

        if (!isOwnMember) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized: You can only update members registered under your coupon code."
            });
        }

        // ── VIN handling ──
        if (updates.vin !== undefined) {
            if (updates.vin && typeof updates.vin === "string") {
                const cleanVin = updates.vin.trim().toUpperCase();

                if (cleanVin !== "") {
                    if (!/^[A-Z0-9]{17,20}$/.test(cleanVin)) {
                        return res.status(400).json({
                            success: false,
                            message:
                                "Invalid Voter Identification Number (VIN). VIN must contain only letters and numbers and be between 17 and 20 characters."
                        });
                    }

                    // Uniqueness check — exclude this member's own current VIN
                    if (await isVinTaken(cleanVin, member._id)) {
                        return res.status(409).json({
                            success: false,
                            message: "This VIN is already registered to another member."
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

        // ── Editable fields ──
        if (updates.fullName)              member.fullName              = updates.fullName.trim();
        if (updates.phone)                 member.phone                 = updates.phone.trim();
        if (updates.course !== undefined)  member.course                = updates.course ? updates.course.trim() : "";
        if (updates.institution)           member.institution           = updates.institution;
        if (updates.lgaOfRegistration)     member.lgaOfRegistration     = updates.lgaOfRegistration.trim();
        if (updates.stateOfRegistration)   member.stateOfRegistration   = updates.stateOfRegistration.trim();
        if (updates.stateResidence)        member.stateResidence        = updates.stateResidence.trim();
        if (updates.address)               member.address               = updates.address.trim();
        if (updates.gender)                member.gender                = updates.gender;

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

        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern || {})[0];
            if (duplicateField === "vin") {
                return res.status(409).json({
                    success: false,
                    message: "This VIN is already registered to another member."
                });
            }
            return res.status(409).json({
                success: false,
                message: `A member with this ${duplicateField || "unique field"} already exists.`,
                error: error.message
            });
        }

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
            return res.status(404).json({ success: false, message: "Student record not found." });
        }

        // ── VIN handling ──
        if (updates.vin !== undefined) {
            if (updates.vin && typeof updates.vin === "string") {
                const cleanVin = updates.vin.trim().toUpperCase();

                if (cleanVin !== "") {
                    if (!/^[A-Z0-9]{17,20}$/.test(cleanVin)) {
                        return res.status(400).json({
                            success: false,
                            message:
                                "Invalid Voter Identification Number (VIN). VIN must contain only letters and numbers and be between 17 and 20 characters."
                        });
                    }

                    // Uniqueness check — exclude this student's own current VIN
                    if (await isVinTaken(cleanVin, student._id)) {
                        return res.status(409).json({
                            success: false,
                            message: "This VIN is already registered to another member."
                        });
                    }

                    student.vin = cleanVin;
                    student.hasPvc = true;
                } else {
                    student.vin = undefined;
                }
            } else {
                student.vin = undefined;
            }
        }

        // ── Editable fields (updated to use renamed fields) ──
        const allowedFields = [
            "fullName", "email", "phone", "gender", "dob",
            "institution", "course", "volunteerPost", "couponCode",
            "usedCouponCode", "lgaOfRegistration", "stateOfRegistration",
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

        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern || {})[0];
            if (duplicateField === "vin") {
                return res.status(409).json({
                    success: false,
                    message: "This VIN is already registered to another member."
                });
            }
            return res.status(409).json({
                success: false,
                message: `A member with this ${duplicateField || "unique field"} already exists.`,
                error: error.message
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to update record.",
            error: error.message
        });
    }
};
