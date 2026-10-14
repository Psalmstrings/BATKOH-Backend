/**
 * PBAT-KOH TEMA — Maintenance Helper Utility
 * Handles name matching, workbook parsing, institution classification,
 * backups, and audit logging for Admin Maintenance operations.
 */

const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

/**
 * Normalizes a name string for comparison:
 * - lowercase
 * - remove non-alphanumeric characters (punctuation, symbols)
 * - collapse multi-spaces to single space
 * - trim edges
 */
function normalizeName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compares two names with robust tolerance:
 * 1. Exact match after normalization.
 * 2. Word-set match (order-independent, e.g. "Salami Bolanle" == "Bolanle Salami").
 * 3. Handles multi-word names (e.g. 3 or 4 names) if one is a subset or reordered.
 */
function nameWordsMatch(nameA, nameB) {
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const wordsA = normA.split(" ").filter(Boolean).sort().join(" ");
  const wordsB = normB.split(" ").filter(Boolean).sort().join(" ");
  if (wordsA === wordsB) return true;

  // Check if first name and last name match when one has a middle name
  const partsA = normA.split(" ").filter(Boolean);
  const partsB = normB.split(" ").filter(Boolean);
  if (partsA.length >= 2 && partsB.length >= 2) {
    const setA = new Set(partsA);
    const setB = new Set(partsB);
    let intersection = 0;
    for (const w of setA) {
      if (setB.has(w)) intersection++;
    }
    // If at least 2 distinct significant words match and one set is a subset of the other
    if (intersection >= 2 && (intersection === setA.size || intersection === setB.size)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if an institution string matches generic "University"
 * Allowing for capitalization and extra spaces.
 */
function isGenericUniversity(inst) {
  if (!inst || typeof inst !== "string") return false;
  return /^\s*university\s*$/i.test(inst);
}

/**
 * Checks if an institution string matches generic "College"
 * Allowing for capitalization and extra spaces.
 */
function isGenericCollege(inst) {
  if (!inst || typeof inst !== "string") return false;
  return /^\s*college\s*$/i.test(inst);
}

/**
 * Maps generic institution to standardized code:
 * "University" -> "LASU" (Lagos State University)
 * "College" -> "LASCON" (Lagos State College of Nursing)
 */
function mapGenericInstitution(inst) {
  if (!inst || typeof inst !== "string") return "";
  const trimmed = inst.trim();
  if (isGenericUniversity(trimmed)) return "LASU";
  if (isGenericCollege(trimmed)) return "LASCON";
  return trimmed.toUpperCase();
}

/**
 * Parse an Excel workbook (buffer or file path) and extract
 * approved names grouped by uppercase sheet name.
 */
function parseWorkbook(bufferOrPath) {
  let wb;
  if (typeof bufferOrPath === "string") {
    wb = XLSX.readFile(bufferOrPath);
  } else {
    wb = XLSX.read(bufferOrPath, { type: "buffer" });
  }

  const result = {
    sheets: {}, // { [SHEET_NAME_UPPER]: string[] }
    rawSheets: wb.SheetNames,
    sheetStats: {} // { [sheetName]: rowCount }
  };

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    // Convert to JSON
    const rows = XLSX.utils.sheet_to_json(sheet);
    const names = [];

    for (const row of rows) {
      let candidate = null;
      // Search for 'Full Name' or 'Name' key
      for (const key of Object.keys(row)) {
        if (/full\s*name/i.test(key) || key.trim().toLowerCase() === "name") {
          candidate = row[key];
          break;
        }
      }
      // Fallback: second column or first non-empty string column
      if (!candidate && row["__EMPTY"] != null) {
        candidate = row["__EMPTY"];
      }
      if (!candidate) {
        const values = Object.values(row);
        if (values.length > 1 && typeof values[1] === "string" && values[1].trim()) {
          candidate = values[1];
        }
      }

      if (candidate && typeof candidate === "string" && candidate.trim()) {
        const clean = candidate.trim();
        // Ignore header repeats like "Full Name"
        if (!/^(full\s*name|name|s\/n)$/i.test(clean)) {
          names.push(clean);
        }
      }
    }

    const key = sheetName.trim().toUpperCase();
    result.sheets[key] = names;
    result.sheetStats[sheetName] = names.length;
  }

  return result;
}

/**
 * Evaluates existing Campus Captains against approved sheets.
 */
function compareCaptains(existingCaptains, approvedSheetsMap) {
  const comparison = [];
  let retainedCount = 0;
  let downgradedCount = 0;

  for (const cap of existingCaptains) {
    const rawInst = cap.institution || "";
    // Determine effective institution for sheet matching
    // (If "University" -> LASU, if "College" -> LASCON)
    const effectiveInst = mapGenericInstitution(rawInst);

    // Get approved list for this institution sheet
    let approvedList = approvedSheetsMap[effectiveInst] || [];
    let matchedName = null;
    let matchedSheet = null;

    // Check if captain's name appears on their institution's approved sheet
    for (const approvedName of approvedList) {
      if (nameWordsMatch(cap.fullName, approvedName)) {
        matchedName = approvedName;
        matchedSheet = effectiveInst;
        break;
      }
    }

    // Special fallback: if captain has generic "University" or "College", check if on LASU or LASCON
    if (!matchedName && isGenericUniversity(rawInst)) {
      const lasuList = approvedSheetsMap["LASU"] || [];
      for (const approvedName of lasuList) {
        if (nameWordsMatch(cap.fullName, approvedName)) {
          matchedName = approvedName;
          matchedSheet = "LASU";
          break;
        }
      }
    }
    if (!matchedName && isGenericCollege(rawInst)) {
      const lasconList = approvedSheetsMap["LASCON"] || [];
      for (const approvedName of lasconList) {
        if (nameWordsMatch(cap.fullName, approvedName)) {
          matchedName = approvedName;
          matchedSheet = "LASCON";
          break;
        }
      }
    }

    const isRetained = Boolean(matchedName);
    if (isRetained) retainedCount++;
    else downgradedCount++;

    comparison.push({
      _id: cap._id ? cap._id.toString() : null,
      fullName: cap.fullName,
      email: cap.email,
      phone: cap.phone,
      dbInstitution: rawInst,
      effectiveInstitution: effectiveInst,
      currentRole: "Campus Captains",
      proposedRole: isRetained ? "Campus Captains" : "Student",
      action: isRetained ? "RETAIN" : "DOWNGRADE",
      matchedName: matchedName || null,
      matchedSheet: matchedSheet || null,
      couponCode: cap.couponCode || null,
      vin: cap.vin || null
    });
  }

  return {
    totalCaptains: existingCaptains.length,
    retainedCount,
    downgradedCount,
    records: comparison
  };
}

/**
 * Ensures migration-reports directory exists
 */
function getReportsDir() {
  const dir = path.join(__dirname, "..", "migration-reports");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Creates a timestamped JSON backup file before write
 */
function createBackup(type, records, metadata = {}) {
  const dir = getReportsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${type}-${timestamp}.json`;
  const filePath = path.join(dir, filename);

  const payload = {
    backupType: type,
    createdAt: new Date().toISOString(),
    recordCount: records.length,
    metadata,
    records
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return { filename, filePath };
}

/**
 * Records an audit log
 */
function writeAuditLog(operation, details) {
  const dir = getReportsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `audit-${operation}-${timestamp}.json`;
  const filePath = path.join(dir, filename);

  const payload = {
    operation,
    timestamp: new Date().toISOString(),
    ...details
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return { filename, filePath };
}

module.exports = {
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
};
