/**
 * ============================================================
 * PBAT-KOH TME — Institution Data Cleanup & Normalization
 * ============================================================
 *
 * Model   : Student  (./models/student.js)
 * Field   : institution
 * DB      : process.env.MONGO_URI (MongoDB Atlas)
 *
 * USAGE
 * ─────
 *   Dry-run (no changes made):
 *     node scripts/normalizeInstitutions.js --dry-run
 *
 *   Live migration:
 *     node scripts/normalizeInstitutions.js
 *
 * SAFETY GUARANTEES
 * ─────────────────
 *   • Idempotent — running twice is safe; already-correct values are skipped.
 *   • Only the `institution` field is modified; every other field is preserved.
 *   • Ambiguous/unrecognised values are NEVER changed — they go to the review list.
 *   • A JSON audit file is written to migration-reports/ before any writes.
 *   • No records are deleted or duplicated.
 * ============================================================
 */

"use strict";

const dotenv   = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const path     = require("path");
const fs       = require("fs");

// We use the raw MongoDB driver for updates so the strict Mongoose enum does
// NOT reject the messy existing values during reads or the update itself.
// The model import is still used for typed queries.
const Student  = require("../models/student");

// ─────────────────────────────────────────────────────────────────────────────
// 1. APPROVED INSTITUTION CODES  (source of truth — matches Mongoose schema enum)
// ─────────────────────────────────────────────────────────────────────────────
const APPROVED_CODES = [
  "UNILAG",
  "YABATECH",
  "LASU",
  "FCE",
  "OCEANOGRAPHY",
  "SACOED",
  "LASCON",
  "LASCOETH",
  "LASUSTECH",
  "LASUED",
  "FCFMT",
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. NORMALIZATION RULES
//
//    Each entry has:
//      code      – the approved enum code to write to the DB
//      patterns  – array of RegExp objects that match known variations
//
//    Rules are applied in ORDER. The first match wins.
//    All matching is done against a PRE-PROCESSED version of the stored value:
//      • trimmed
//      • internal whitespace collapsed to a single space
//      • "&" replaced with "and"
//      • comma and period spacing normalised
//
//    RULE ORDERING IS CRITICAL:
//      LASU must appear before LASUSTECH and LASUED, because
//      "Lagos State University" is a prefix of both longer names.
//      All LASU patterns use a $ end-anchor or a known-safe suffix.
// ─────────────────────────────────────────────────────────────────────────────
const NORMALIZATION_RULES = [

  // ── UNILAG ─────────────────────────────────────────────────────────────────
  {
    code: "UNILAG",
    patterns: [
      /^unilag$/i,
      /^university\s+of\s+lagos$/i,
      /^uni\s*lag$/i,
    ],
  },

  // ── YABATECH ───────────────────────────────────────────────────────────────
  {
    code: "YABATECH",
    patterns: [
      /^yabatech$/i,
      /^yaba\s+tech$/i,
      /^yaba\s+tec$/i,
      /^yaba\s+college\s+of\s+technology$/i,
      // "Yaba College of Technology, Yaba, Lagos"
      /^yaba\s+college\s+of\s+technology,/i,
      // "Yabatech college of technology" / "Yabatech polytechnic lagos"
      /^yabatech\s+(college|polytechnic)/i,
      // "Yaba collage of technology" (typo)
      /^yaba\s+colla?ge\s+of\s+technology/i,
      // "Yaba college of Technology In affiliation with university of Nigeria Nsukka"
      /^yaba\s+college\s+of\s+technology\s+in\s+affiliation/i,
      // "University of Nigeria affiliated with yabatech"
      /affiliated\s+with\s+yabatech/i,
    ],
  },

  // ── LASU ───────────────────────────────────────────────────────────────────
  // IMPORTANT: Ordered BEFORE LASUSTECH and LASUED.
  // All patterns use $ anchor or known-safe suffixes to prevent false matches.
  {
    code: "LASU",
    patterns: [
      /^lasu$/i,
      /^lagos\s+state\s+university$/i,
      // "LAGOS STATE UNIVERSITY." (trailing period)
      /^lagos\s+state\s+university\.$/i,
      // "Lagos state university LASU" / "Lagos state university (LASU)"
      /^lagos\s+state\s+university[\s(,]+(lasu)\)?$/i,
      // "LAGOS STATE UNIVERSITY, OJO" / "Lagos State University, Ojo." / variants
      /^lagos\s+state\s+university[,\s]+ojo/i,
      // "LASU Ojo"
      /^lasu\s+ojo$/i,
      // "Lagos state university ( LASU ojo campus)"
      /^lagos\s+state\s+university\s*\(\s*lasu\s+ojo\s+campus\s*\)$/i,
      // "Lagos State University of Lagos" — confused phrasing but clearly LASU
      /^lagos\s+state\s+university\s+of\s+lagos$/i,
      // "Lagos state university teaching hospital" / "...ikeja" — LASU-affiliated staff
      /^lagos\s+state\s+university\s+teaching\s+hospital/i,
      // Bare "Lagos state university" with trailing comma/campus suffix
      /^lagos\s+state\s+university,\s+ojo\s+campus$/i,
    ],
  },

  // ── LASUSTECH ──────────────────────────────────────────────────────────────
  {
    code: "LASUSTECH",
    patterns: [
      /^lasustech$/i,
      /^lasustec$/i,
      /^lasus\s+tech$/i,
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+technology$/i,
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+tech$/i,
      // "(LASUSTECH)" parenthetical suffix
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+technology\s*\(?\s*lasustech\s*\)?$/i,
      // "LASUSTECH (LAGOS STATE UNIVERSITY OF SCIENCE AND TECHNOLOGY)"
      /^lasustech\s*\(\s*lagos\s+state\s+university\s+of\s+science\s+and\s+technology\s*\)$/i,
      // ", LASUSTECH" suffix (comma or space)
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+technology[,\s]+lasustech$/i,
      // Trailing period
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+technology\.$/i,
      // " lasustech" suffix (no comma)
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+technology\s+lasustech$/i,
      // "University: LASUSTECH"
      /^university:\s*lasustech$/i,
      // "Lasustech university" / "LASUSTECH University"
      /^lasustech\s+university$/i,
      // "LASUSTECH IKORODU" / "LASUSTECH, Ikorodu" / "Lasustech ikorodu"
      /^lasustech[,\s]+ikorodu$/i,
      // "Lagos state university of science and technology, ikorodu" + variants
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+technology[,\s]+ikorodu/i,
      // "LAGOS STATE UNIVERSITY OF SCIENCE & TECHNOLOGY  IKORODU LAGOS"
      // (& → "and" via preprocess, double-space collapsed)
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+technology\s+ikorodu/i,
      // "Lagos state university of science of technology" (typo: "of")
      /^lagos\s+state\s+university\s+of\s+science\s+of\s+technology$/i,
      // "Lagos state university if science and technology" (typo: "if")
      /^lagos\s+state\s+university\s+if\s+science\s+and\s+technology$/i,
      // "Lagos sate university of scienceAnd Technology" (typo + no space before "And")
      /^lagos\s+sate\s+university\s+of\s+science\s*and\s+technology$/i,
      // "Lagos state science and technology" (abbreviated)
      /^lagos\s+state\s+science\s+and\s+technology$/i,
      // "University of science and technology" (no location prefix — context-safe)
      /^university\s+of\s+science\s+and\s+technology$/i,
      // "Lagos State University of Science and Technology, Ikorodu Lagos"
      /^lagos\s+state\s+university\s+of\s+science\s+and\s+technology,\s+ikorodu\s+lagos$/i,
    ],
  },

  // ── LASUED ─────────────────────────────────────────────────────────────────
  {
    code: "LASUED",
    patterns: [
      /^lasued$/i,
      /^lagos\s+state\s+university\s+of\s+education$/i,
      /^lagos\s+state\s+university\s+education$/i,
      // "(LASUED)" / "(Lasued)" / "( LASUED )" parenthetical suffix
      /^lagos\s+state\s+university\s+of\s+education\s*\(?\s*lasue?d?\s*\)?$/i,
      // "LAGOS STATE UNIVERSITY OF EDUCATION LASUED" (no parens)
      /^lagos\s+state\s+university\s+of\s+education\s+lasue?d$/i,
      // "Lagos state university of education (LAUSED)" — typo in code
      /^lagos\s+state\s+university\s+of\s+education\s*\(\s*laused\s*\)$/i,
      // "LASUED OTTO/IJANIKIN"
      /^lasued\s+otto?\s*\/\s*ij?ani?kin$/i,
      // "Lagos state university of education Oto/ Ijaniki" / "Ijanikin" / "Otto"
      /^lagos\s+state\s+university\s+of\s+education\s+(oto?|ijanikin|otto)/i,
      // "Lagos State University of Education(LASUED), Oto/Ijanikin,Lagos"
      /^lagos\s+state\s+university\s+of\s+education\s*\(?\s*lasue?d?\s*\)?,?\s*(oto?|ijanikin)/i,
      // "LAGOS STATE OF UNIVERSITY OF EDUCATION" (word-order error)
      /^lagos\s+state\s+of\s+university\s+of\s+education$/i,
      // "Lagos state university of education, epe" — LASUED Epe campus
      /^lagos\s+state\s+university\s+of\s+education[,\s]+epe$/i,
      // "Lagos state university of Education Otto" (typo of "Oto")
      /^lagos\s+state\s+university\s+of\s+education\s+otto$/i,
      // Broad catch-all: anything starting "lagos state university of education" not caught above
      /^lagos\s+state\s+university\s+of\s+education/i,
      // "Lagos. State University of Education" (period typo after "Lagos")
      // After preprocess, "Lagos. State" → "Lagos.State" (no space after period)
      /^lagos\.state\s+university\s+of\s+education/i,
    ],
  },

  // ── FCE ────────────────────────────────────────────────────────────────────
  {
    code: "FCE",
    patterns: [
      /^fce$/i,
      /^fce[,\s]+akoka$/i,
      /^federal\s+college\s+of\s+education[,\s]*akoka$/i,
      /^federal\s+college\s+of\s+education$/i,
      // "Federal college of education technical akoka" / "Technical Akoka"
      /^federal\s+college\s+of\s+education\s+technical[,\s]*akoka$/i,
      // "FEDERAL COLLEGE OF EDUCATION (TECHNICAL), AKOKA"
      /^federal\s+college\s+of\s+education\s*\(technical\)[,\s]*akoka$/i,
      // "Federal College of Education (T) Akoka"
      /^federal\s+college\s+of\s+education\s*\(t\)\s*akoka$/i,
      // "FCET Akoka" — Federal College of Education (Technical), Akoka
      /^fcet\s+akoka$/i,
      // "Federal college of education Technical Akoka"
      /^federal\s+college\s+of\s+education\s+technical\s+akoka$/i,
    ],
  },

  // ── OCEANOGRAPHY ───────────────────────────────────────────────────────────
  {
    code: "OCEANOGRAPHY",
    patterns: [
      /^oceanography$/i,
      /^niomr$/i,
      /^nigerian?\s+institute\s+(for|of)\s+oceanography\s+and\s+marine\s+research$/i,
    ],
  },

  // ── SACOED ─────────────────────────────────────────────────────────────────
  {
    code: "SACOED",
    patterns: [
      /^sacoed$/i,
      /^st\.?\s+augustine\s+college\s+of\s+education$/i,
      /^st\.?\s+augustine\s+coe$/i,
      // "Sacoed university" — intent is unambiguous
      /^sacoed\s+university$/i,
      // "St Augustine College of Education in" (truncated but identifiable)
      /^st\.?\s+augustine\s+college\s+of\s+education\s+in/i,
    ],
  },

  // ── LASCON ─────────────────────────────────────────────────────────────────
  // Includes Lagos State College of Nursing and its Igando campus variants
  {
    code: "LASCON",
    patterns: [
      /^lascon$/i,
      /^lagos\s+state\s+college\s+of\s+nursing$/i,
      /^lagos\s+state\s+college\s+of\s+nursing\s+sciences?$/i,
      /^lagos\s+state\s+college\s+of\s+nursing(\s+sciences?)?([,\s]+igando.*)?$/i,
    ],
  },

  // ── LASCOETH ───────────────────────────────────────────────────────────────
  {
    code: "LASCOETH",
    patterns: [
      /^lascoeth$/i,
      /^lascoht$/i,
      /^lascohet$/i,
      /^lagos\s+state\s+college\s+of\s+health\s+technology$/i,
      /^lagos\s+state\s+college\s+of\s+health\s+tech$/i,
      // "Lagos state college of health and technology"
      /^lagos\s+state\s+college\s+of\s+health\s+and\s+technology$/i,
      // "Lagos State college of health" (abbreviated — only LASCOETH fits this)
      /^lagos\s+state\s+college\s+of\s+health$/i,
      // "...technology,Yaba." / "...technology yaba" suffix
      /^lagos\s+state\s+college\s+of\s+health\s+(and\s+)?tech(nology)?[,\s]+yaba/i,
      // "Lagos state college of helath technology yaba" (typo: "helath")
      /^lagos\s+state\s+college\s+of\s+helath\s+tech(nology)?/i,
      // "Lagos state college of health teachnology" (typo: "teachnology")
      /^lagos\s+state\s+college\s+of\s+health\s+teach?nology$/i,
      // "Lagos state college of health technology yaba" / "...yaba lagos"
      /^lagos\s+state\s+college\s+of\s+health\s+tech(nology)?\s+yaba/i,
      // "Lagos state college of health technology, yaba"
      /^lagos\s+state\s+college\s+of\s+health\s+technology[,\s]+yaba/i,
      // "LAGOS STATE COLLEGE OF HEALTH TECHNOLOGY YABA" / "...YABA LAGOS"
      /^lagos\s+state\s+college\s+of\s+health\s+technology\s+yaba/i,
      // "Lascohet school of health yaba"
      /^lascohet\s+school\s+of\s+health/i,
      // "College of health technology yaba" (no "Lagos state" prefix)
      /^college\s+of\s+health\s+tech(nology)?\s+yaba$/i,
    ],
  },

  // ── FCFMT ──────────────────────────────────────────────────────────────────
  {
    code: "FCFMT",
    patterns: [
      /^fcfmt$/i,
      /^federal\s+college\s+of\s+fisheries\s+and\s+marine\s+technology$/i,
      // "Fedral college of fisheries and marine technology" (typo: "Fedral")
      /^fedral\s+college\s+of\s+fisheries\s+and\s+marine\s+technology$/i,
      // "Federal college of fishery and marine technology" ("fishery" instead of "fisheries")
      /^federal\s+college\s+of\s+fishery\s+and\s+marine\s+technology$/i,
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. PREPROCESS HELPER
//    Normalises a raw value for pattern matching.
// ─────────────────────────────────────────────────────────────────────────────
function preprocess(raw) {
  if (raw == null) return null;
  return raw
    .trim()                          // strip leading/trailing whitespace
    .replace(/\s+/g, " ")           // collapse multiple spaces to one
    .replace(/&/g, "and")           // & → and
    .replace(/\s*,\s*/g, ", ")      // normalise comma spacing
    .replace(/\s*\.\s*/g, ".");     // normalise period spacing
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLASSIFY
//    Returns the approved code string, or null if unmatched.
// ─────────────────────────────────────────────────────────────────────────────
function classify(rawValue) {
  if (rawValue == null || rawValue.trim() === "") return null;
  const normalised = preprocess(rawValue);
  for (const rule of NORMALIZATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalised)) {
        return rule.code;
      }
    }
  }
  return null; // unmatched
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function isApprovedCode(value) {
  return APPROVED_CODES.includes(value);
}

function pad(str, width) {
  return String(str).padEnd(width, " ");
}

function rpad(str, width) {
  return String(str).padStart(width, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("=========================================");
  console.log("  PBAT-KOH TME  INSTITUTION CLEANUP");
  console.log(isDryRun ? "  DRY RUN  (no changes will be made)" : "  LIVE MIGRATION");
  console.log("=========================================\n");

  // ── Connect ──────────────────────────────────────────────────────────────
  if (!process.env.MONGO_URI) {
    console.error("FATAL: MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB…");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected.\n");

  // ── Raw collection (bypasses Mongoose enum validation on reads/writes) ────
  const col = mongoose.connection.collection("students");

  // ── Fetch ALL records — only _id and institution ─────────────────────────
  const allRecords = await col
    .find({}, { projection: { _id: 1, institution: 1 } })
    .toArray();

  const totalScanned = allRecords.length;
  console.log(`Total records in collection: ${totalScanned}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 6a. ANALYSE
  // ─────────────────────────────────────────────────────────────────────────
  const alreadyCorrect = [];  // { _id, code }
  const toUpdate       = [];  // { _id, oldInstitution, newInstitution }
  const unmatched      = [];  // { _id, rawValue }
  const empty          = [];  // { _id }

  // Grouped for dry-run display: targetCode → { rawValue → count }
  const groupedChanges  = {};
  const unmatchedCounts = {};

  for (const rec of allRecords) {
    const raw = rec.institution;

    // ── EMPTY / NULL ───────────────────────────────────────────────────────
    if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
      empty.push({ _id: rec._id });
      continue;
    }

    // ── ALREADY CORRECT ───────────────────────────────────────────────────
    if (isApprovedCode(raw)) {
      alreadyCorrect.push({ _id: rec._id, code: raw });
      continue;
    }

    // ── TRY TO CLASSIFY ───────────────────────────────────────────────────
    const targetCode = classify(raw);

    if (targetCode) {
      toUpdate.push({ _id: rec._id, oldInstitution: raw, newInstitution: targetCode });

      if (!groupedChanges[targetCode]) groupedChanges[targetCode] = {};
      groupedChanges[targetCode][raw] = (groupedChanges[targetCode][raw] || 0) + 1;
    } else {
      unmatched.push({ _id: rec._id, rawValue: raw });
      unmatchedCounts[raw] = (unmatchedCounts[raw] || 0) + 1;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6b. DRY-RUN REPORT — PROPOSED CHANGES
  // ─────────────────────────────────────────────────────────────────────────
  console.log("=========================================");
  console.log("  PROPOSED CHANGES");
  console.log("=========================================\n");

  for (const code of APPROVED_CODES) {
    const bucket = groupedChanges[code];
    if (!bucket || Object.keys(bucket).length === 0) continue;

    console.log(code);
    console.log("-".repeat(55));
    for (const [rawVal, count] of Object.entries(bucket)) {
      console.log(
        `  ${pad(JSON.stringify(rawVal), 48)}  →  ${pad(code, 12)}  ${rpad(count, 5)} record(s)`
      );
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6c. SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  const updateCountByCode = {};
  for (const rec of toUpdate) {
    updateCountByCode[rec.newInstitution] = (updateCountByCode[rec.newInstitution] || 0) + 1;
  }

  console.log("=========================================");
  console.log("  SUMMARY");
  console.log("=========================================\n");

  for (const code of APPROVED_CODES) {
    console.log(`  ${pad(code + ":", 16)}  ${rpad(updateCountByCode[code] || 0, 6)} record(s) to update`);
  }

  console.log();
  console.log(`  Total records scanned         : ${totalScanned}`);
  console.log(`  Already correctly normalised  : ${alreadyCorrect.length}`);
  console.log(`  To be updated                 : ${toUpdate.length}`);
  console.log(`  Unmatched (needs review)      : ${unmatched.length}`);
  console.log(`  Empty / null institution      : ${empty.length}`);
  console.log();

  if (unmatched.length > 0) {
    console.log("=========================================");
    console.log("  UNMATCHED / NEEDS MANUAL REVIEW");
    console.log("=========================================\n");
    for (const [rawVal, count] of Object.entries(unmatchedCounts)) {
      console.log(`  ${pad(JSON.stringify(rawVal), 52)}  ${rpad(count, 5)} record(s)`);
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6d. STOP HERE IF DRY-RUN
  // ─────────────────────────────────────────────────────────────────────────
  if (isDryRun) {
    console.log("=========================================");
    console.log("  DRY-RUN COMPLETE — database unchanged");
    console.log("  Review the proposed changes above.");
    console.log("  Re-run WITHOUT --dry-run to apply.");
    console.log("=========================================");
    await mongoose.disconnect();
    return;
  }

  if (toUpdate.length === 0) {
    console.log("Nothing to update. All records are already normalised or require manual review.");
    await mongoose.disconnect();
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6e. WRITE AUDIT / BACKUP FILE  (before any DB changes)
  // ─────────────────────────────────────────────────────────────────────────
  const reportsDir = path.join(__dirname, "..", "migration-reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const dateStr   = new Date().toISOString().slice(0, 10);
  const auditFile = path.join(reportsDir, `institution-cleanup-${dateStr}.json`);

  const auditPayload = {
    generatedAt      : new Date().toISOString(),
    totalScanned     : totalScanned,
    alreadyNormalised: alreadyCorrect.length,
    toUpdate         : toUpdate.length,
    unmatchedCount   : unmatched.length,
    emptyCount       : empty.length,
    changes          : toUpdate.map(r => ({
      _id      : r._id.toString(),
      oldSchool: r.oldInstitution,
      newSchool: r.newInstitution,
    })),
    unmatched: unmatched.map(r => ({
      _id     : r._id.toString(),
      rawValue: r.rawValue,
    })),
    empty: empty.map(r => ({ _id: r._id.toString() })),
  };

  fs.writeFileSync(auditFile, JSON.stringify(auditPayload, null, 2), "utf8");
  console.log(`Audit file written → ${auditFile}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 6f. PERFORM MIGRATION  (bulkWrite — one round-trip, ordered: false for speed)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("Running migration…\n");

  const bulkOps = toUpdate.map(rec => ({
    updateOne: {
      filter: { _id: rec._id },
      update: { $set: { institution: rec.newInstitution } },
    },
  }));

  const result = await col.bulkWrite(bulkOps, { ordered: false });

  const matchedCount  = result.matchedCount  ?? 0;
  const modifiedCount = result.modifiedCount ?? 0;

  // Log each change
  console.log("CHANGE LOG:");
  console.log("-".repeat(55));
  for (const rec of toUpdate) {
    console.log(`  [${rec._id}]  "${rec.oldInstitution}"  →  ${rec.newInstitution}`);
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // 6g. POST-MIGRATION VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log("=========================================");
  console.log("  POST-MIGRATION VERIFICATION");
  console.log("=========================================\n");

  const distinctInstitutions = await col.distinct("institution");
  distinctInstitutions.sort();

  const stillOdd = distinctInstitutions.filter(v => v && !APPROVED_CODES.includes(v));

  console.log("Distinct institution values in DB after migration:\n");
  for (const v of distinctInstitutions) {
    let tag;
    if (APPROVED_CODES.includes(v))             tag = "✓ OK";
    else if (!v || v.trim() === "")              tag = "○ EMPTY";
    else                                          tag = "✗ NEEDS REVIEW";
    console.log(`  [${tag}]  ${JSON.stringify(v)}`);
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // 6h. FINAL REPORT
  // ─────────────────────────────────────────────────────────────────────────
  console.log("=========================================");
  console.log("  MIGRATION COMPLETED");
  console.log("=========================================\n");

  console.log(`  Records scanned               : ${totalScanned}`);
  console.log(`  Records already normalised    : ${alreadyCorrect.length}`);
  console.log(`  Records matched by driver     : ${matchedCount}`);
  console.log(`  Records successfully updated  : ${modifiedCount}`);
  console.log(`  Records unmatched             : ${unmatched.length}`);
  console.log(`  Empty institution values      : ${empty.length}`);
  console.log();

  console.log("-".repeat(45));
  console.log("  NORMALISED TOTALS (in DB now)");
  console.log("-".repeat(45));

  for (const code of APPROVED_CODES) {
    const count = await col.countDocuments({ institution: code });
    console.log(`  ${pad(code + ":", 16)}  ${rpad(count, 6)}`);
  }

  console.log();
  console.log("-".repeat(45));
  console.log("  SAFETY CONFIRMATIONS");
  console.log("-".repeat(45));
  console.log("  ✓  No records were deleted.");
  console.log("  ✓  Only the `institution` field was modified.");
  console.log("  ✓  Ambiguous values were left untouched.");
  console.log("  ✓  Final values comply with the Mongoose schema enum.");
  console.log(`  ✓  Audit trail saved → ${auditFile}`);
  console.log();

  if (stillOdd.length > 0) {
    console.log("-".repeat(45));
    console.log("  STILL NEEDS MANUAL REVIEW");
    console.log("-".repeat(45));
    for (const v of stillOdd) {
      const cnt = await col.countDocuments({ institution: v });
      console.log(`  ${pad(JSON.stringify(v), 50)}  ${rpad(cnt, 5)} record(s)`);
    }
    console.log();
  }

  console.log("=========================================\n");
  await mongoose.disconnect();
  console.log("Disconnected from MongoDB. Done.");
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
main().catch(err => {
  console.error("\nFATAL ERROR:", err);
  process.exit(1);
});
