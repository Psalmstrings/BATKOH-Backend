const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// Signup route
router.post("/signup", adminController.signup);

// Login route
router.post("/login", adminController.login);

module.exports = router;
