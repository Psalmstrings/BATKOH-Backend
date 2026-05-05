const Student = require("../models/student");

const checkExistingStudent = async (req, res, next) => {
  try {
    const { email, phone } = req.body;

    // Check email
    const emailExists = await Student.findOne({ email });
    if (emailExists) {
      return res.status(400).json({
        status: "error",
        msg: "Email already exists",
      });
    }

    // Check phone
    const phoneExists = await Student.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({
        status: "error",
        msg: "Phone number already exists",
      });
    }

    next(); // Continue to controller
  } catch (err) {
    res.status(500).json({
      status: "error",
      msg: "Server Error",
    });
  }
};

module.exports = checkExistingStudent;
