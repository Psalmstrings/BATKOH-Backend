/**
 * Comprehensive Test Suite for PBAT-KOH TEMA Data Maintenance
 *
 * Tests:
 * 1. Name normalization & word-set matching
 * 2. Generic institution classification & restriction rules
 * 3. Excel workbook sheet reading & captain matching logic
 * 4. Institution cleanup preview accuracy
 * 5. Recoverable backup & audit log generation
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

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

async function runTests() {
  console.log("=================================================");
  console.log("  RUNNING DATA MAINTENANCE TEST SUITE");
  console.log("=================================================\n");

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
    }
  }

  // ── TEST GROUP 1: Name Normalization & Matching ──
  console.log("Group 1: Name Normalization & Tolerance Matching");
  test("Normalizes lowercase and collapses whitespace", () => {
    assert.strictEqual(normalizeName("  Lamina   Ayo  "), "lamina ayo");
  });

  test("Exact match ignoring case", () => {
    assert.strictEqual(nameWordsMatch("LAMINA AYO", "Lamina Ayo"), true);
  });

  test("Order-independent name match (Firstname Lastname vs Lastname Firstname)", () => {
    assert.strictEqual(nameWordsMatch("Salami Bolanle", "Bolanle Salami"), true);
    assert.strictEqual(nameWordsMatch("Akomologbon Ibrahim Ayomikun", "Ayomikun Ibrahim Akomologbon"), true);
  });

  test("Punctuation stripping in names", () => {
    assert.strictEqual(nameWordsMatch("Olukoya, Temitayo Victor", "Olukoya Temitayo Victor"), true);
  });

  test("Non-matching different names return false", () => {
    assert.strictEqual(nameWordsMatch("Lamina Ayo", "Salami Bolanle"), false);
  });

  // ── TEST GROUP 2: Generic Institution Rules & Restrictions ──
  console.log("\nGroup 2: Generic Institution Classification & Restrictions");
  test("Rule A: Exactly 'University' (case-insensitive, trimmed) matches", () => {
    assert.strictEqual(isGenericUniversity("University"), true);
    assert.strictEqual(isGenericUniversity("university"), true);
    assert.strictEqual(isGenericUniversity("  UNIVERSITY  "), true);
  });

  test("Rule A Restriction: Does NOT match specific institutions containing 'University'", () => {
    assert.strictEqual(isGenericUniversity("University of Lagos"), false);
    assert.strictEqual(isGenericUniversity("Lagos State University"), false);
    assert.strictEqual(isGenericUniversity("LASU"), false);
    assert.strictEqual(isGenericUniversity("LASUSTECH"), false);
    assert.strictEqual(isGenericUniversity("LASUED"), false);
  });

  test("Rule B: Exactly 'College' (case-insensitive, trimmed) matches", () => {
    assert.strictEqual(isGenericCollege("College"), true);
    assert.strictEqual(isGenericCollege("college"), true);
    assert.strictEqual(isGenericCollege("  COLLEGE  "), true);
  });

  test("Rule B Restriction: Does NOT match specific colleges containing 'College'", () => {
    assert.strictEqual(isGenericCollege("Yaba College of Technology"), false);
    assert.strictEqual(isGenericCollege("Federal College of Education"), false);
    assert.strictEqual(isGenericCollege("Lagos State College of Nursing"), false);
    assert.strictEqual(isGenericCollege("LASCON"), false);
    assert.strictEqual(isGenericCollege("FCE"), false);
  });

  test("Mapping generic institutions to official codes", () => {
    assert.strictEqual(mapGenericInstitution("University"), "LASU");
    assert.strictEqual(mapGenericInstitution("college"), "LASCON");
    assert.strictEqual(mapGenericInstitution("UNILAG"), "UNILAG");
    assert.strictEqual(mapGenericInstitution("LASUED"), "LASUED");
  });

  // ── TEST GROUP 3: Excel Workbook Processing ──
  console.log("\nGroup 3: Excel Workbook Processing");
  const workbookPath = "c:/Users/HP/OneDrive/Desktop/Active Campus_Captains_2026-10-12.xlsx";
  test("Parses multi-sheet Excel workbook correctly", () => {
    assert.strictEqual(fs.existsSync(workbookPath), true, "Workbook file must exist");
    const parsed = parseWorkbook(workbookPath);
    assert.ok(parsed.rawSheets.length >= 9, "Workbook should contain at least 9 institution sheets");
    assert.ok(parsed.sheets["UNILAG"].length >= 2, "UNILAG sheet should contain approved captains");
    assert.ok(parsed.sheets["LASUED"].length >= 35, "LASUED sheet should contain approved captains");
    assert.ok(parsed.sheets["LASU"].length >= 10, "LASU sheet should contain approved captains");
    assert.ok(parsed.sheets["LASCON"].length >= 6, "LASCON sheet should contain approved captains");
  });

  // ── TEST GROUP 4: Database Live Integration Tests ──
  console.log("\nGroup 4: Database State & Matching Analysis");
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.collection("students");

  const totalStudents = await col.countDocuments();
  test("Total students count is consistent (1,566)", () => {
    assert.strictEqual(totalStudents, 1566);
  });

  const genericUnivCount = await col.countDocuments({ institution: { $regex: /^\s*university\s*$/i } });
  const genericCollCount = await col.countDocuments({ institution: { $regex: /^\s*college\s*$/i } });
  test("Identifies exactly 80 generic University and 14 generic College records", () => {
    assert.strictEqual(genericUnivCount, 80, "Generic University count should be 80");
    assert.strictEqual(genericCollCount, 14, "Generic College count should be 14");
  });

  const parsed = parseWorkbook(workbookPath);
  const existingCaptains = await col.find({ volunteerPost: "Campus Captains" }).toArray();
  test("Identifies 139 existing Campus Captains in database", () => {
    assert.strictEqual(existingCaptains.length, 139);
  });

  const comparison = compareCaptains(existingCaptains, parsed.sheets);
  test("Campus Captain evaluation yields exactly 83 Retained and 56 Downgraded", () => {
    assert.strictEqual(comparison.retainedCount, 83, "Expected 83 captains to be retained");
    assert.strictEqual(comparison.downgradedCount, 56, "Expected 56 captains to be downgraded");
    assert.strictEqual(comparison.records.length, 139, "All 139 captains evaluated");
  });

  // ── TEST GROUP 5: Backup & Audit Log Generation ──
  console.log("\nGroup 5: Backup & Audit Log Safety Mechanism");
  test("Creates recoverable backup file in migration-reports/", () => {
    const sampleRecords = [{ _id: new mongoose.Types.ObjectId(), name: "Test" }];
    const backup = createBackup("test-suite", sampleRecords, { testRun: true });
    assert.ok(fs.existsSync(backup.filePath), "Backup file must be written to disk");
    const content = JSON.parse(fs.readFileSync(backup.filePath, "utf8"));
    assert.strictEqual(content.recordCount, 1);
    // Cleanup test file
    fs.unlinkSync(backup.filePath);
  });

  test("Creates audit log file in migration-reports/", () => {
    const audit = writeAuditLog("test-suite", { test: true });
    assert.ok(fs.existsSync(audit.filePath), "Audit file must be written to disk");
    fs.unlinkSync(audit.filePath);
  });

  await mongoose.disconnect();

  console.log("\n=================================================");
  console.log(`  TEST RESULTS: ${passed}/${total} PASSED`);
  console.log("=================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
