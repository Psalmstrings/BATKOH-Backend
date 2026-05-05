const bcrypt = require("bcryptjs");
const Admin = require("../models/admin");
const jwt = require("jsonwebtoken");

// Create JWT token
const createToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Signup controller
exports.signup = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({
                status: "error",
                msg: "Please provide all required fields"
            });
        }

        // Check if admin already exists
        const existing = await Admin.findOne({ email });
        if (existing) {
            return res.status(400).json({
                status: "error",
                msg: "Admin with this email already exists"
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create admin
        const admin = await Admin.create({ fullName, email, password: hashedPassword });

        res.status(201).json({
            status: "success",
            msg: "Signup successful",
            admin: {
                id: admin._id,
                fullName: admin.fullName,
                email: admin.email
            }
        });
    } catch (err) {
        res.status(500).json({
            status: "error",
            msg: err.message
        });
    }
};

// Login controller
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: "error",
                msg: "Email and password are required"
            });
        }

        // Find admin by email
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(400).json({
                status: "error",
                msg: "Email not found"
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).json({
                status: "error",
                msg: "Incorrect password"
            });
        }

        // Generate token
        const token = createToken(admin._id);

        res.status(200).json({
            status: "success",
            msg: "Login successful",
            admin: {
                id: admin._id,
                fullName: admin.fullName,
                email: admin.email
            },
            token
        });

    } catch (err) {
        res.status(500).json({
            status: "error",
            msg: err.message
        });
    }
};
