/**
 * PBAT-KOH TEMA — Maintenance Controller
 * Handles Campus Captain updates via Excel workbook,
 * generic institution cleanup (University -> LASU, College -> LASCON),
 * safety backups, verification checks, and audit trails.
 */

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Student = require("../models/student");
const {
  normalizeName,
  nameWordsMatch,
  isGenericUniversity,
  isGenericCollege,
  mapGenericInstitution,
  parseWorkbook,
  compareCaptains,
  createBackup,
  writeAuditLog,
  getReportsDir
} = require("../utils/maintenanceHelper");

// Raw collection helper to bypass strict mongoose enum schema restrictions during migrations
const getStudentCol = () => mongoose.connection.collection("students");

/**
 * GET /api/admin/maintenance/stats
 * Overview metrics of current database state
 */
exports.getStats = async (req, res) => {
  try {
    const col = getStudentCol();
    const totalStudents = await col.countDocuments();

    const univCount = await col.countDocuments({
      institution: { $regex: /^\s*university\s*$/i }
    });

    const collegeCount = await col.countDocuments({
      institution: { $regex: /^\s*college\s*$/i }
    });

    const campusCaptainsCount = await col.countDocuments({
      volunteerPost: "Campus Captains"
    });

    const roleBreakdown = {};
    const roles = await col.distinct("volunteerPost");
    for (const r of roles) {
      roleBreakdown[r] = await col.countDocuments({ volunteerPost: r });
    }

    const institutionBreakdown = {};
    const insts = await col.distinct("institution");
    for (const i of insts) {
      institutionBreakdown[i || "EMPTY"] = await col.countDocuments({ institution: i });
    }

    return res.status(200).json({
      success: true,
      stats: {
        totalStudents,
        campusCaptainsCount,
        genericUniversityCount: univCount,
        genericCollegeCount: collegeCount,
        needsInstitutionCleanup: univCount + collegeCount,
        roleBreakdown,
        institutionBreakdown
      }
    });
  } catch (error) {
    console.error("GET MAINTENANCE STATS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve maintenance statistics.",
      error: error.message
    });
  }
};

/**
 * GET /api/admin/maintenance/preview-institutions
 * Preview student records affected by Rule A and Rule B
 */
exports.previewInstitutions = async (req, res) => {
  try {
    const col = getStudentCol();

    // Rule A: generic "University"
    const univRecords = await col
      .find({ institution: { $regex: /^\s*university\s*$/i } })
      .project({
        _id: 1,
        fullName: 1,
        email: 1,
        phone: 1,
        institution: 1,
        volunteerPost: 1,
        couponCode: 1
      })
      .toArray();

    // Rule B: generic "College"
    const collegeRecords = await col
      .find({ institution: { $regex: /^\s*college\s*$/i } })
      .project({
        _id: 1,
        fullName: 1,
        email: 1,
        phone: 1,
        institution: 1,
        volunteerPost: 1,
        couponCode: 1
      })
      .toArray();

    const previewList = [
      ...univRecords.map(r => ({
        _id: r._id.toString(),
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        currentInstitution: r.institution,
        rule: "Rule A",
        targetInstitutionName: "Lagos State University",
        targetInstitutionCode: "LASU",
        volunteerPost: r.volunteerPost,
        couponCode: r.couponCode
      })),
      ...collegeRecords.map(r => ({
        _id: r._id.toString(),
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        currentInstitution: r.institution,
        rule: "Rule B",
        targetInstitutionName: "Lagos State College of Nursing",
        targetInstitutionCode: "LASCON",
        volunteerPost: r.volunteerPost,
        couponCode: r.couponCode
      }))
    ];

    const totalStudents = await col.countDocuments();

    return res.status(200).json({
      success: true,
      summary: {
        totalStudents,
        ruleACount: univRecords.length,
        ruleBCount: collegeRecords.length,
        totalToUpdate: previewList.length,
        unaffectedCount: totalStudents - previewList.length
      },
      records: previewList
    });
  } catch (error) {
    console.error("PREVIEW INSTITUTIONS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to preview institution cleanup.",
      error: error.message
    });
  }
};

/**
 * POST /api/admin/maintenance/preview-captains
 * Evaluates Excel workbook sheets against existing Campus Captains
 */
exports.previewCaptains = async (req, res) => {
  try {
    const col = getStudentCol();
    let approvedSheetsMap = {};
    let sheetStats = {};
    let rawSheetNames = [];

    // Option 1: Client passed parsed sheet names & data
    if (req.body.sheets && typeof req.body.sheets === "object") {
      rawSheetNames = Object.keys(req.body.sheets);
      for (const [sName, namesArray] of Object.entries(req.body.sheets)) {
        const key = sName.trim().toUpperCase();
        approvedSheetsMap[key] = Array.isArray(namesArray) ? namesArray : [];
        sheetStats[sName] = approvedSheetsMap[key].length;
      }
    }
    // Option 2: Base64 workbook payload
    else if (req.body.fileData) {
      const buffer = Buffer.from(req.body.fileData, "base64");
      const parsed = parseWorkbook(buffer);
      approvedSheetsMap = parsed.sheets;
      sheetStats = parsed.sheetStats;
      rawSheetNames = parsed.rawSheets;
    }
    // Option 3: Fallback to Desktop Active Campus Captains workbook if on same machine
    else {
      const defaultPaths = [
        "c:/Users/HP/OneDrive/Desktop/Active Campus_Captains_2026-10-12.xlsx",
        "c:/Users/HP/OneDrive/Desktop/Campus_Captains_2026-10-12.xlsx"
      ];
      let foundPath = null;
      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }
      if (foundPath) {
        const parsed = parseWorkbook(foundPath);
        approvedSheetsMap = parsed.sheets;
        sheetStats = parsed.sheetStats;
        rawSheetNames = parsed.rawSheets;
      } else {
        return res.status(400).json({
          success: false,
          message: "Please upload or provide the Excel workbook data."
        });
      }
    }

    // Fetch all existing Campus Captains from DB
    const existingCaptains = await col
      .find({ volunteerPost: "Campus Captains" })
      .toArray();

    const comparisonResult = compareCaptains(existingCaptains, approvedSheetsMap);

    return res.status(200).json({
      success: true,
      summary: {
        totalCaptainsInDb: comparisonResult.totalCaptains,
        retainedCount: comparisonResult.retainedCount,
        downgradedCount: comparisonResult.downgradedCount,
        sheetStats,
        sheetNames: rawSheetNames
      },
      records: comparisonResult.records
    });
  } catch (error) {
    console.error("PREVIEW CAPTAINS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to preview Campus Captain updates.",
      error: error.message
    });
  }
};

/**
 * POST /api/admin/maintenance/execute-institutions
 * Executes Rule A & Rule B institution cleanup
 * Requires confirmation, creates recoverable backup, audits & verifies
 */
exports.executeInstitutions = async (req, res) => {
  try {
    const { confirmed } = req.body;
    if (!confirmed) {
      return res.status(400).json({
        success: false,
        message: "Administrator confirmation is required before executing institution cleanup."
      });
    }

    const col = getStudentCol();
    const preTotalStudents = await col.countDocuments();

    // Query all affected records
    const univQuery = { institution: { $regex: /^\s*university\s*$/i } };
    const collegeQuery = { institution: { $regex: /^\s*college\s*$/i } };

    const recordsToUpdate = await col
      .find({ $or: [univQuery, collegeQuery] })
      .toArray();

    if (recordsToUpdate.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No generic 'University' or 'College' records found. Database is already clean.",
        updatedCount: 0
      });
    }

    // Pre-counts of LASU and LASCON
    const preLasuCount = await col.countDocuments({ institution: "LASU" });
    const preLasconCount = await col.countDocuments({ institution: "LASCON" });

    // ── STEP 1: CREATE RECOVERABLE BACKUP ──
    const backupInfo = createBackup("institutions", recordsToUpdate, {
      adminId: req.admin ? req.admin._id : "admin",
      adminEmail: req.admin ? req.admin.email : "admin",
      reason: "Standardize generic University to LASU and College to LASCON"
    });

    // ── STEP 2: EXECUTE CLEANUP VIA BULKWRITE ──
    const bulkOps = recordsToUpdate.map(doc => {
      const targetCode = isGenericUniversity(doc.institution) ? "LASU" : "LASCON";
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { institution: targetCode } }
        }
      };
    });

    const bulkResult = await col.bulkWrite(bulkOps, { ordered: false });

    // ── STEP 3: POST-VERIFICATION CHECKS ──
    const postTotalStudents = await col.countDocuments();
    const remainingUniv = await col.countDocuments(univQuery);
    const remainingCollege = await col.countDocuments(collegeQuery);
    const postLasuCount = await col.countDocuments({ institution: "LASU" });
    const postLasconCount = await col.countDocuments({ institution: "LASCON" });

    const univUpdatedCount = recordsToUpdate.filter(r => isGenericUniversity(r.institution)).length;
    const collUpdatedCount = recordsToUpdate.filter(r => isGenericCollege(r.institution)).length;

    const verification = {
      preTotalStudents,
      postTotalStudents,
      studentCountPreserved: preTotalStudents === postTotalStudents,
      remainingGenericUniversity: remainingUniv,
      remainingGenericCollege: remainingCollege,
      genericEliminated: remainingUniv === 0 && remainingCollege === 0,
      lasuIncrease: postLasuCount - preLasuCount,
      expectedLasuIncrease: univUpdatedCount,
      lasconIncrease: postLasconCount - preLasconCount,
      expectedLasconIncrease: collUpdatedCount,
      noAccountsDeleted: preTotalStudents === postTotalStudents
    };

    // ── STEP 4: RECORD AUDIT LOG ──
    const auditInfo = writeAuditLog("institution-cleanup", {
      admin: req.admin ? { id: req.admin._id, email: req.admin.email, name: req.admin.fullName } : null,
      matchedCount: bulkResult.matchedCount,
      modifiedCount: bulkResult.modifiedCount,
      ruleACount: univUpdatedCount,
      ruleBCount: collUpdatedCount,
      backupFile: backupInfo.filename,
      verification
    });

    return res.status(200).json({
      success: true,
      message: `Successfully standardized ${bulkResult.modifiedCount} institution records (${univUpdatedCount} to LASU, ${collUpdatedCount} to LASCON).`,
      backupFile: backupInfo.filename,
      auditFile: auditInfo.filename,
      modifiedCount: bulkResult.modifiedCount,
      ruleACount: univUpdatedCount,
      ruleBCount: collUpdatedCount,
      verification
    });
  } catch (error) {
    console.error("EXECUTE INSTITUTIONS CLEANUP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to execute institution cleanup.",
      error: error.message
    });
  }
};

/**
 * POST /api/admin/maintenance/execute-captains
 * Executes Campus Captain status update based on approved Excel workbook.
 * Downgrades non-approved captains to "Student".
 * Preserves all student data, passwords, coupon codes, emails, etc.
 * Requires confirmation, creates recoverable backup, audits & verifies
 */
exports.executeCaptains = async (req, res) => {
  try {
    const { confirmed, sheets, fileData } = req.body;
    if (!confirmed) {
      return res.status(400).json({
        success: false,
        message: "Administrator confirmation is required before executing Campus Captain updates."
      });
    }

    const col = getStudentCol();
    let approvedSheetsMap = {};

    if (sheets && typeof sheets === "object") {
      for (const [sName, namesArray] of Object.entries(sheets)) {
        approvedSheetsMap[sName.trim().toUpperCase()] = Array.isArray(namesArray) ? namesArray : [];
      }
    } else if (fileData) {
      const buffer = Buffer.from(fileData, "base64");
      const parsed = parseWorkbook(buffer);
      approvedSheetsMap = parsed.sheets;
    } else {
      const defaultPaths = [
        "c:/Users/HP/OneDrive/Desktop/Active Campus_Captains_2026-10-12.xlsx",
        "c:/Users/HP/OneDrive/Desktop/Campus_Captains_2026-10-12.xlsx"
      ];
      let foundPath = null;
      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }
      if (foundPath) {
        const parsed = parseWorkbook(foundPath);
        approvedSheetsMap = parsed.sheets;
      } else {
        return res.status(400).json({
          success: false,
          message: "No workbook data provided."
        });
      }
    }

    const preTotalStudents = await col.countDocuments();
    const existingCaptains = await col
      .find({ volunteerPost: "Campus Captains" })
      .toArray();

    const comparisonResult = compareCaptains(existingCaptains, approvedSheetsMap);
    const toDowngrade = comparisonResult.records.filter(r => r.action === "DOWNGRADE");

    if (toDowngrade.length === 0) {
      return res.status(200).json({
        success: true,
        message: "All Campus Captains are already approved on the workbook list. No role changes needed.",
        retainedCount: comparisonResult.retainedCount,
        downgradedCount: 0
      });
    }

    // Get the full DB records of the downgraded captains for backup
    const downgradeIds = toDowngrade.map(r => new mongoose.Types.ObjectId(r._id));
    const fullDowngradeRecords = await col.find({ _id: { $in: downgradeIds } }).toArray();

    // ── STEP 1: CREATE RECOVERABLE BACKUP ──
    const backupInfo = createBackup("captains", fullDowngradeRecords, {
      adminId: req.admin ? req.admin._id : "admin",
      adminEmail: req.admin ? req.admin.email : "admin",
      retainedCount: comparisonResult.retainedCount,
      downgradedCount: toDowngrade.length,
      reason: "Downgrade unapproved Campus Captains to Student role"
    });

    // ── STEP 2: EXECUTE DOWNGRADES VIA BULKWRITE ──
    // ONLY modifies volunteerPost: "Student".
    // Absolutely NO accounts deleted, NO data erased.
    const bulkOps = downgradeIds.map(id => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { volunteerPost: "Student" } }
      }
    }));

    const bulkResult = await col.bulkWrite(bulkOps, { ordered: false });

    // ── STEP 3: POST-VERIFICATION CHECKS ──
    const postTotalStudents = await col.countDocuments();
    const postCaptainsCount = await col.countDocuments({ volunteerPost: "Campus Captains" });

    const verification = {
      preTotalStudents,
      postTotalStudents,
      studentCountPreserved: preTotalStudents === postTotalStudents,
      noAccountsDeleted: preTotalStudents === postTotalStudents,
      postCaptainsCount,
      expectedCaptainsCount: comparisonResult.retainedCount,
      captainsCountMatches: postCaptainsCount === comparisonResult.retainedCount,
      downgradedCount: bulkResult.modifiedCount
    };

    // ── STEP 4: RECORD AUDIT LOG ──
    const auditInfo = writeAuditLog("captain-role-updates", {
      admin: req.admin ? { id: req.admin._id, email: req.admin.email, name: req.admin.fullName } : null,
      retainedCount: comparisonResult.retainedCount,
      downgradedCount: bulkResult.modifiedCount,
      backupFile: backupInfo.filename,
      downgradedStudents: toDowngrade.map(r => ({
        id: r._id,
        name: r.fullName,
        institution: r.dbInstitution
      })),
      verification
    });

    return res.status(200).json({
      success: true,
      message: `Successfully retained ${comparisonResult.retainedCount} approved Campus Captains and updated ${bulkResult.modifiedCount} to ordinary Student.`,
      backupFile: backupInfo.filename,
      auditFile: auditInfo.filename,
      retainedCount: comparisonResult.retainedCount,
      downgradedCount: bulkResult.modifiedCount,
      verification
    });
  } catch (error) {
    console.error("EXECUTE CAPTAINS UPDATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to execute Campus Captain updates.",
      error: error.message
    });
  }
};

/**
 * GET /api/admin/maintenance/backups
 * List available backup and audit files
 */
exports.getBackups = async (req, res) => {
  try {
    const dir = getReportsDir();
    const files = fs.readdirSync(dir);
    const backups = files.map(file => {
      const stats = fs.statSync(path.join(dir, file));
      return {
        filename: file,
        size: stats.size,
        createdAt: stats.birthtime,
        isBackup: file.startsWith("backup-"),
        isAudit: file.startsWith("audit-")
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ success: true, files: backups });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/admin/maintenance/download-backup/:filename
 * Download a backup file
 */
exports.downloadBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    // Security check: filename must not contain directory traversal
    if (!/^[a-zA-Z0-9_\-.]+\.json$/.test(filename)) {
      return res.status(400).json({ success: false, message: "Invalid filename." });
    }

    const filePath = path.join(getReportsDir(), filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Backup file not found." });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/admin/maintenance/restore-backup
 * Restores records from a recoverable backup file
 */
exports.restoreBackup = async (req, res) => {
  try {
    const { filename, confirmed } = req.body;
    if (!confirmed) {
      return res.status(400).json({ success: false, message: "Confirmation is required to restore." });
    }
    if (!/^[a-zA-Z0-9_\-.]+\.json$/.test(filename)) {
      return res.status(400).json({ success: false, message: "Invalid filename." });
    }

    const filePath = path.join(getReportsDir(), filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Backup file not found." });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const col = getStudentCol();

    if (!Array.isArray(data.records) || data.records.length === 0) {
      return res.status(400).json({ success: false, message: "Backup file has no valid records." });
    }

    const bulkOps = data.records.map(rec => {
      const id = new mongoose.Types.ObjectId(rec._id);
      const updateDoc = { ...rec };
      delete updateDoc._id;
      return {
        updateOne: {
          filter: { _id: id },
          update: { $set: updateDoc }
        }
      };
    });

    const result = await col.bulkWrite(bulkOps, { ordered: false });

    writeAuditLog("restore-backup", {
      admin: req.admin ? { id: req.admin._id, email: req.admin.email } : null,
      restoredFrom: filename,
      modifiedCount: result.modifiedCount
    });

    return res.status(200).json({
      success: true,
      message: `Successfully restored ${result.modifiedCount} records from backup ${filename}.`,
      restoredCount: result.modifiedCount
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
