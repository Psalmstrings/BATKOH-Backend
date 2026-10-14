/**
 * PBAT-KOH TEMA — Campus Captain Update & Student Institution Cleanup
 *
 * Maintenance CLI Script
 *
 * USAGE:
 *   Dry-run preview (safe, no writes):
 *     node scripts/runMaintenance.js --dry-run
 *
 *   Live execution (creates recoverable backup, writes audit log, verifies):
 *     node scripts/runMaintenance.js --execute
 *
 *   Specific operations:
 *     node scripts/runMaintenance.js --institutions-only [--dry-run | --execute]
 *     node scripts/runMaintenance.js --captains-only [--dry-run | --execute]
 *     node scripts/runMaintenance.js --file "path/to/workbook.xlsx"
 */

"use strict";

const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const {
  isGenericUniversity,
  isGenericCollege,
  parseWorkbook,
  compareCaptains,
  createBackup,
  writeAuditLog
} = require("../utils/maintenanceHelper");

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run") || !args.includes("--execute");
  const institutionsOnly = args.includes("--institutions-only");
  const captainsOnly = args.includes("--captains-only");

  let filePath = "c:/Users/HP/OneDrive/Desktop/Active Campus_Captains_2026-10-12.xlsx";
  const fileArgIdx = args.indexOf("--file");
  if (fileArgIdx !== -1 && args[fileArgIdx + 1]) {
    filePath = args[fileArgIdx + 1];
  } else if (!fs.existsSync(filePath)) {
    const fallback = "c:/Users/HP/OneDrive/Desktop/Campus_Captains_2026-10-12.xlsx";
    if (fs.existsSync(fallback)) filePath = fallback;
  }

  console.log("=================================================================");
  console.log("  PBAT-KOH TEMA — CAMPUS CAPTAIN UPDATE & INSTITUTION CLEANUP");
  console.log(isDryRun ? "  MODE: DRY-RUN PREVIEW (No changes will be made to DB)" : "  MODE: LIVE EXECUTION (Changes will be applied with full backup)");
  console.log("=================================================================\n");

  if (!process.env.MONGO_URI) {
    console.error("FATAL: MONGO_URI missing from environment variables.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB Atlas...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected successfully.\n");

  const col = mongoose.connection.collection("students");
  const totalStudentsAtStart = await col.countDocuments();
  console.log(`Total students in collection at start: ${totalStudentsAtStart}`);

  // =========================================================================
  // PART 2 PREVIEW: INSTITUTION CLEANUP (Rule A & Rule B)
  // =========================================================================
  let univRecords = [];
  let collegeRecords = [];

  if (!captainsOnly) {
    console.log("\n-----------------------------------------------------------------");
    console.log("  PART 2: STUDENT INSTITUTION RECORDS CLEANUP (ANALYSIS)");
    console.log("-----------------------------------------------------------------");

    univRecords = await col.find({ institution: { $regex: /^\s*university\s*$/i } }).toArray();
    collegeRecords = await col.find({ institution: { $regex: /^\s*college\s*$/i } }).toArray();

    console.log(`Rule A [Generic "University" -> Lagos State University (LASU)]:`);
    console.log(`  Matching records found: ${univRecords.length}`);

    console.log(`Rule B [Generic "College" -> Lagos State College of Nursing (LASCON)]:`);
    console.log(`  Matching records found: ${collegeRecords.length}`);

    console.log(`Total records requiring institution standardization: ${univRecords.length + collegeRecords.length}`);
  }

  // =========================================================================
  // PART 1 PREVIEW: CAMPUS CAPTAIN UPDATE VIA EXCEL WORKBOOK
  // =========================================================================
  let comparisonResult = null;
  let parsedWb = null;

  if (!institutionsOnly) {
    console.log("\n-----------------------------------------------------------------");
    console.log("  PART 1: CAMPUS CAPTAIN STATUS UPDATE (EXCEL WORKBOOK)");
    console.log("-----------------------------------------------------------------");
    console.log(`Loading Excel workbook: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      console.error(`ERROR: Workbook file not found at ${filePath}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    parsedWb = parseWorkbook(filePath);
    console.log(`Found ${parsedWb.rawSheets.length} institution sheets in workbook:`);
    for (const [sName, cnt] of Object.entries(parsedWb.sheetStats)) {
      console.log(`  - Sheet [${sName}]: ${cnt} approved captains`);
    }

    const existingCaptains = await col.find({ volunteerPost: "Campus Captains" }).toArray();
    console.log(`\nExisting Campus Captains in database: ${existingCaptains.length}`);

    comparisonResult = compareCaptains(existingCaptains, parsedWb.sheets);

    console.log(`\nMatch Results:`);
    console.log(`  ✓ Campus Captains Retained (approved on sheet): ${comparisonResult.retainedCount}`);
    console.log(`  ↓ Campus Captains to Downgrade to "Student"   : ${comparisonResult.downgradedCount}`);

    console.log("\nRetained Campus Captains sample:");
    comparisonResult.records.filter(r => r.action === "RETAIN").slice(0, 5).forEach(r => {
      console.log(`  [RETAIN] ${r.fullName} (${r.effectiveInstitution}) - matched on sheet: ${r.matchedSheet}`);
    });

    console.log("\nDowngraded Campus Captains sample:");
    comparisonResult.records.filter(r => r.action === "DOWNGRADE").slice(0, 5).forEach(r => {
      console.log(`  [DOWNGRADE] ${r.fullName} (${r.dbInstitution}) - not listed on approved sheet`);
    });
  }

  // =========================================================================
  // IF DRY RUN, STOP HERE
  // =========================================================================
  if (isDryRun) {
    console.log("\n=================================================================");
    console.log("  DRY-RUN COMPLETE — DATABASE UNCHANGED");
    console.log("  To execute these changes live with automatic recoverable backup,");
    console.log("  run: node scripts/runMaintenance.js --execute");
    console.log("=================================================================\n");
    await mongoose.disconnect();
    return;
  }

  // =========================================================================
  // LIVE EXECUTION: ADMIN SAFETY, BACKUPS, WRITES, VERIFICATION
  // =========================================================================
  console.log("\n=================================================================");
  console.log("  EXECUTING LIVE DATA MAINTENANCE OPERATIONS");
  console.log("=================================================================\n");

  // ── 1. EXECUTE PART 2 (INSTITUTION CLEANUP) ──
  if (!captainsOnly && (univRecords.length > 0 || collegeRecords.length > 0)) {
    console.log("Executing Part 2: Institution Standardization...");
    const allInstRecords = [...univRecords, ...collegeRecords];

    // Pre-counts for verification
    const preLasu = await col.countDocuments({ institution: "LASU" });
    const preLascon = await col.countDocuments({ institution: "LASCON" });

    // Step A: Backup
    console.log("Creating recoverable backup of affected institution records...");
    const instBackup = createBackup("institutions-cli", allInstRecords, {
      totalAffected: allInstRecords.length,
      ruleA: univRecords.length,
      ruleB: collegeRecords.length
    });
    console.log(`✓ Backup saved to: ${instBackup.filename}`);

    // Step B: Bulk update
    const instOps = allInstRecords.map(doc => {
      const targetCode = isGenericUniversity(doc.institution) ? "LASU" : "LASCON";
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { institution: targetCode } }
        }
      };
    });

    const instResult = await col.bulkWrite(instOps, { ordered: false });
    console.log(`✓ Updated ${instResult.modifiedCount} records (${univRecords.length} -> LASU, ${collegeRecords.length} -> LASCON).`);

    // Step C: Verify
    const postTotal = await col.countDocuments();
    const remainingUniv = await col.countDocuments({ institution: { $regex: /^\s*university\s*$/i } });
    const remainingCollege = await col.countDocuments({ institution: { $regex: /^\s*college\s*$/i } });
    const postLasu = await col.countDocuments({ institution: "LASU" });
    const postLascon = await col.countDocuments({ institution: "LASCON" });

    console.log("Verification:");
    console.log(`  - Total students preserved: ${postTotal === totalStudentsAtStart} (${postTotal}/${totalStudentsAtStart})`);
    console.log(`  - Remaining generic 'University': ${remainingUniv}`);
    console.log(`  - Remaining generic 'College': ${remainingCollege}`);
    console.log(`  - LASU increase: +${postLasu - preLasu} (expected +${univRecords.length})`);
    console.log(`  - LASCON increase: +${postLascon - preLascon} (expected +${collegeRecords.length})`);

    writeAuditLog("institution-cleanup-cli", {
      modifiedCount: instResult.modifiedCount,
      backupFile: instBackup.filename,
      preTotal,
      postTotal
    });
  }

  // ── 2. EXECUTE PART 1 (CAMPUS CAPTAIN UPDATES) ──
  if (!institutionsOnly && comparisonResult) {
    console.log("\nExecuting Part 1: Campus Captain Role Updates...");
    const toDowngrade = comparisonResult.records.filter(r => r.action === "DOWNGRADE");

    if (toDowngrade.length > 0) {
      const downgradeIds = toDowngrade.map(r => new mongoose.Types.ObjectId(r._id));
      const fullRecords = await col.find({ _id: { $in: downgradeIds } }).toArray();

      // Step A: Backup
      console.log(`Creating recoverable backup of ${fullRecords.length} downgraded captains...`);
      const capBackup = createBackup("captains-cli", fullRecords, {
        retainedCount: comparisonResult.retainedCount,
        downgradedCount: toDowngrade.length
      });
      console.log(`✓ Backup saved to: ${capBackup.filename}`);

      // Step B: Bulk update to "Student"
      const capOps = downgradeIds.map(id => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { volunteerPost: "Student" } }
        }
      }));

      const capResult = await col.bulkWrite(capOps, { ordered: false });
      console.log(`✓ Successfully updated ${capResult.modifiedCount} records to 'Student' role.`);

      // Step C: Verify
      const postTotal = await col.countDocuments();
      const postCaptains = await col.countDocuments({ volunteerPost: "Campus Captains" });

      console.log("Verification:");
      console.log(`  - Total students preserved (no deletions): ${postTotal === totalStudentsAtStart} (${postTotal}/${totalStudentsAtStart})`);
      console.log(`  - Total Campus Captains in DB now: ${postCaptains} (expected ${comparisonResult.retainedCount})`);
      console.log(`  - Downgraded count matches: ${capResult.modifiedCount === toDowngrade.length}`);

      writeAuditLog("captain-role-updates-cli", {
        modifiedCount: capResult.modifiedCount,
        backupFile: capBackup.filename,
        retainedCount: comparisonResult.retainedCount,
        downgradedCount: toDowngrade.length
      });
    } else {
      console.log("No captains required role downgrade.");
    }
  }

  console.log("\n=================================================================");
  console.log("  ALL MAINTENANCE OPERATIONS COMPLETED SUCCESSFULLY!");
  console.log("=================================================================\n");

  await mongoose.disconnect();
  console.log("Disconnected from database.");
}

main().catch(err => {
  console.error("FATAL ERROR IN MAINTENANCE SCRIPT:", err);
  process.exit(1);
});
