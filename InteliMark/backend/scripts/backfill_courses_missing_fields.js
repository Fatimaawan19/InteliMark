/**
 * One-off script: backfill missing fields in Course documents.
 *
 * Some Course docs may have missing teacherId/courseCode/courseTitle due to older pipelines.
 * This script attempts to infer the missing values from related collections:
 * - Assessment (courseId, courseCode, teacherId)
 * - Submission (courseId, courseCode, courseName, teacherId)
 * - CLO (courseId, courseCode)
 *
 * It only writes when it can infer a non-empty value.
 *
 * Usage (from backend folder):
 *   node scripts/backfill_courses_missing_fields.js
 *
 * Optional:
 *   node scripts/backfill_courses_missing_fields.js --dry-run true
 */

const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const Course = require("../models/Course");
const Assessment = require("../models/Assessment");
const Submission = require("../models/Submission");
const CLO = require("../models/CLO");

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function truthyStr(v) {
  const s = String(v || "").trim();
  return s ? s : null;
}

async function main() {
  const dryRun = String(readArg("--dry-run") || "false").trim().toLowerCase() === "true";

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing. Ensure backend/.env has MONGO_URI.");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  const courses = await Course.find({}).lean();
  let scanned = 0;
  let updated = 0;

  for (const c of courses) {
    scanned += 1;
    const courseId = c._id;
    const before = {
      _id: String(c._id),
      teacherId: c.teacherId ?? null,
      courseCode: c.courseCode ?? null,
      courseTitle: c.courseTitle ?? null,
    };

    const needsTeacherId = !truthyStr(c.teacherId);
    const needsCourseCode = !truthyStr(c.courseCode);
    const needsCourseTitle = !truthyStr(c.courseTitle);

    if (!needsTeacherId && !needsCourseCode && !needsCourseTitle) continue;

    // Infer from related collections (prefer submissions first for courseTitle/courseName)
    const [sub, asmt, clo] = await Promise.all([
      Submission.findOne({ courseId }).select("teacherId courseCode courseName").lean().catch(() => null),
      Assessment.findOne({ courseId }).select("teacherId courseCode").lean().catch(() => null),
      CLO.findOne({ courseId }).select("courseCode").lean().catch(() => null),
    ]);

    const patch = {};
    if (needsTeacherId) {
      patch.teacherId = truthyStr(sub?.teacherId) || truthyStr(asmt?.teacherId) || null;
    }
    if (needsCourseCode) {
      patch.courseCode = truthyStr(sub?.courseCode) || truthyStr(asmt?.courseCode) || truthyStr(clo?.courseCode) || null;
    }
    if (needsCourseTitle) {
      patch.courseTitle = truthyStr(sub?.courseName) || null;
    }

    // Remove null/undefined fields
    for (const k of Object.keys(patch)) {
      if (patch[k] == null) delete patch[k];
    }
    if (Object.keys(patch).length === 0) continue;

    updated += 1;
    console.log("\n---");
    console.log("Course:", String(courseId));
    console.log("Before:", before);
    console.log("Patch:", patch);

    if (!dryRun) {
      await Course.updateOne({ _id: courseId }, { $set: patch }).catch((e) => {
        console.warn("⚠️ Update failed:", e?.message || String(e));
      });
    }
  }

  console.log("\n========================================");
  console.log("Backfill complete");
  console.log("dryRun:", dryRun);
  console.log("courses scanned:", scanned);
  console.log("courses patched:", updated);
  console.log("========================================\n");

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("❌ backfill_courses_missing_fields failed:", e?.message || String(e));
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

