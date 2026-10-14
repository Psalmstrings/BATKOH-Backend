const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const maintenanceController = require("../controllers/maintenanceController");
const { verifyAdmin } = require("../middlewares/authMiddleware");

// Signup route
router.post("/signup", adminController.signup);

// Login route
router.post("/login", adminController.login);

// ==========================================
// DATA MAINTENANCE & CLEANUP ROUTES (Admin)
// ==========================================
router.get("/maintenance/stats", verifyAdmin, maintenanceController.getStats);
router.get("/maintenance/preview-institutions", verifyAdmin, maintenanceController.previewInstitutions);
router.post("/maintenance/preview-captains", verifyAdmin, maintenanceController.previewCaptains);
router.post("/maintenance/execute-institutions", verifyAdmin, maintenanceController.executeInstitutions);
router.post("/maintenance/execute-captains", verifyAdmin, maintenanceController.executeCaptains);
router.get("/maintenance/backups", verifyAdmin, maintenanceController.getBackups);
router.get("/maintenance/download-backup/:filename", verifyAdmin, maintenanceController.downloadBackup);
router.post("/maintenance/restore-backup", verifyAdmin, maintenanceController.restoreBackup);

module.exports = router;

