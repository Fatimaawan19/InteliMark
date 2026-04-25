/**
 * One-off backfill:
 * 1) Update Mongo Course documents (creditHours/department) from syllabus extractedText (best-effort regex).
 * 2) Sync those fields into Firestore `courses` documents so teacher portal shows them.
 *
 * Usage (from backend folder):
 *   node scripts/backfill_course_meta_from_syllabus_and_sync_firestore.js --course-codes "DS-001,DS-003" --dry-run true
 *   node scripts/backfill_course_meta_from_syllabus_and_sync_firestore.js --course-codes "DS-001,DS-003"
 *
 * Notes:
 * - Uses backend/.env for MONGO_URI
 * - Uses Firebase Admin service account at backend/config/serviceAccountKey.json
 */

const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const Course = require("../models/Course");
const { firestore } = require("../config/firebase");

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function parseCsv(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function truthyStr(v) {
  const s = String(v || "").trim();
  return s ? s : null;
}

function parseCreditHours(text) {
  const t = String(text || "");
  const m =
    t.match(/credit\s*hours?\s*[:\-]\s*([0-9]{1,2})/i) ||
    t.match(/credit\s*hours?\s+([0-9]{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseDepartment(text) {
  const t = String(text || "");
  const m =
    t.match(/department\s*[:\-]\s*([A-Za-z&/ ,]{2,80})/i) ||
    t.match(/dept\.?\s*[:\-]\s*([A-Za-z&/ ,]{2,80})/i);
  if (!m) return null;
  return truthyStr(m[1]);
}

async function main() {
  const dryRun = String(readArg("--dry-run") || "false").trim().toLowerCase() === "true";
  const courseCodes = parseCsv(readArg("--course-codes"));
  if (!courseCodes.length) throw new Error("Provide --course-codes \"DS-001,DS-003\"");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing in backend/.env");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });

  for (const code of courseCodes) {
    const upper = code.toUpperCase();
    const mongoCourse = await Course.findOne({ courseCode: upper });
    if (!mongoCourse) {
      console.warn(`⚠️ Mongo course not found for courseCode=${upper}`);
      continue;
    }

    const before = {
      courseCode: mongoCourse.courseCode,
      courseTitle: mongoCourse.courseTitle,
      creditHours: mongoCourse.creditHours,
      department: mongoCourse.department || "",
    };

    const extractedText = String(mongoCourse.extractedText || "");
    const patch = {};

    if ((!mongoCourse.creditHours || mongoCourse.creditHours === 0) && extractedText) {
      const ch = parseCreditHours(extractedText);
      if (ch != null) patch.creditHours = ch;
    }
    if (!truthyStr(mongoCourse.department) && extractedText) {
      const dep = parseDepartment(extractedText);
      if (dep) patch.department = dep;
    }

    if (Object.keys(patch).length) {
      console.log("\n---");
      console.log("Mongo Course:", upper);
      console.log("Before:", before);
      console.log("Patch:", patch);
      if (!dryRun) {
        Object.assign(mongoCourse, patch);
        await mongoCourse.save();
      }
    } else {
      console.log(`\nMongo Course ${upper}: no patch needed (or no extractedText match).`);
    }

    // Sync to Firestore: update all courses docs with same courseCode.
    const snap = await firestore.collection("courses").where("courseCode", "==", upper).get();
    if (snap.empty) {
      console.warn(`⚠️ Firestore course doc not found for courseCode=${upper}`);
      continue;
    }

    const fsPatch = {};
    // Firestore uses creditHours + department + courseName
    if (truthyStr(mongoCourse.department)) fsPatch.department = String(mongoCourse.department);
    if (Number.isFinite(Number(mongoCourse.creditHours))) fsPatch.creditHours = Number(mongoCourse.creditHours) || 0;
    if (truthyStr(mongoCourse.courseTitle)) fsPatch.courseName = String(mongoCourse.courseTitle);
    fsPatch.mongodbCourseId = String(mongoCourse._id);

    console.log(`Firestore courseCode=${upper}: ${snap.size} doc(s) will be updated with`, fsPatch);
    if (!dryRun) {
      const batch = firestore.batch();
      snap.docs.forEach((d) => batch.update(d.ref, fsPatch));
      await batch.commit();
    }
  }

  console.log("\nDone. dryRun=", dryRun);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("❌ backfill_course_meta_from_syllabus_and_sync_firestore failed:", e?.message || String(e));
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

