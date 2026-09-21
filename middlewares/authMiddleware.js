const jwt = require("jsonwebtoken");
const Admin = require("../models/admin");
const Student = require("../models/student");

// Verify Admin JWT
exports.verifyAdmin = async (req, res, next) => {
  try {
    let token = req.headers.authorization;
    if (!token || !token.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No authentication token provided.",
      });
    }

    token = token.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin authentication token.",
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Authentication failed. Token is invalid or expired.",
      error: error.message,
    });
  }
};

// Verify Captain JWT (Campus Captains & Staff Captains)
exports.verifyCaptain = async (req, res, next) => {
  try {
    let token = req.headers.authorization;
    if (!token || !token.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Captain token required.",
      });
    }

    token = token.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const captain = await Student.findById(decoded.id);
    if (!captain || !["Campus Captains", "Staff Captains"].includes(captain.volunteerPost)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You must be an authorized Captain.",
      });
    }

    req.captain = captain;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Captain session expired or invalid. Please log in again.",
      error: error.message,
    });
  }
};
