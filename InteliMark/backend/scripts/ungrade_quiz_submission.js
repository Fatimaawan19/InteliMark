#!/usr/bin/env node
/**
 * Mark a submission as "ungraded" again for re-grading.
 *
 * Default behavior:
 * - Finds submission by assessmentTitle + studentName (defaults: Quiz1 + Hamza Awan)
 * - Clears grade + AI fields + gradedAt, sets status="submitted"
 * - Clears automark fields in SubmissionRaw (keeps extraction/FAISS fields intact)
 *
 * Usage:
 *  node scripts/ungrade_quiz_submission.js
 *  node scripts/ungrade_quiz_submission.js --assessmentTitle "Quiz1" --studentName "Hamza Awan"
 *  node scripts/ungrade_quiz_submission.js --submissionId <id>
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Submission = require("../models/Submission");
const SubmissionRaw = require("../models/SubmissionRaw");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--assessmentTitle") out.assessmentTitle = argv[++i];
    else if (a === "--studentName") out.studentName = argv[++i];
    else if (a === "--submissionId") out.submissionId = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function buildDirectMongoUriFromSrv(srvUri, hostsCsv) {
  if (!srvUri || typeof srvUri !== "string") return null;
  if (!srvUri.startsWith("mongodb+srv://")) return null;
  if (!hostsCsv || typeof hostsCsv !== "string" || !hostsCsv.trim()) return null;

  const withoutScheme = srvUri.replace("mongodb+srv://", "");
  const atIndex = withoutScheme.indexOf("@");
  if (atIndex === -1) return null;

  const creds = withoutScheme.slice(0, atIndex);
  const rest = withoutScheme.slice(atIndex + 1);
  const slashIndex = rest.indexOf("/");
  if (slashIndex === -1) return null;

  const pathAndQuery = rest.slice(slashIndex);
  const hosts = hostsCsv
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .join(",");
  if (!hosts) return null;

  const hasQuery = pathAndQuery.includes("?");
  const lower = pathAndQuery.toLowerCase();
  const needsAuthSource = !lower.includes("authsource=");
  const uri =
    `mongodb://${creds}@${hosts}${pathAndQuery}` +
    `${hasQuery ? "&" : "?"}tls=true` +
    `${needsAuthSource ? "&authSource=admin" : ""}`;
  return uri;
}

async function connectMongo() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) throw new Error("Missing MONGO_URI in backend/.env");
  const opts = { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 };
  try {
    await mongoose.connect(MONGO_URI, opts);
    return;
  } catch (err) {
    const msg = String(err?.message || "");
    const isSrvDnsError = msg.includes("querySrv") || msg.includes("_mongodb._tcp") || err?.code === "ECONNREFUSED";
    const directUri = buildDirectMongoUriFromSrv(MONGO_URI, process.env.MONGO_HOSTS);
    if (isSrvDnsError && directUri) {
      await mongoose.connect(directUri, opts);
      return;
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      [
        "Usage:",
        "  node scripts/ungrade_quiz_submission.js [--assessmentTitle \"Quiz1\"] [--studentName \"Hamza Awan\"]",
        "  node scripts/ungrade_quiz_submission.js --submissionId <id>",
      ].join("\n")
    );
    process.exit(0);
  }

  const assessmentTitle = String(args.assessmentTitle || "Quiz1").trim();
  const studentName = String(args.studentName || "Hamza Awan").trim();
  const submissionId = args.submissionId ? String(args.submissionId).trim() : "";

  await connectMongo();

  let sub = null;
  if (submissionId) {
    sub = await Submission.findById(submissionId);
  } else {
    sub = await Submission.findOne({
      assessmentTitle,
      studentName,
      status: "graded",
    }).sort({ submittedAt: -1 });
  }

  if (!sub) {
    throw new Error(
      submissionId
        ? `Submission not found: ${submissionId}`
        : `No graded submission found for student="${studentName}" assessmentTitle="${assessmentTitle}"`
    );
  }

  const subId = String(sub._id);

  await Submission.updateOne(
    { _id: sub._id },
    {
      $set: {
        status: "submitted",
        grade: null,
        gradedAt: null,
        aiGradingSuggestion: null,
        aiConfidence: null,
        aiAnalysis: null,
        manualOverride: false,
      },
    }
  );

  await SubmissionRaw.updateOne(
    { submissionId: sub._id },
    {
      $set: {
        automarkStatus: "missing",
        automarkError: "",
        automarkedAt: null,
        automarkReport: null,
        perQuestionScores: [],
        totalAwardedMarks: null,
      },
    }
  ).catch(() => {});

  const updated = await Submission.findById(subId).lean();
  const raw = await SubmissionRaw.findOne({ submissionId: subId })
    .select("automarkStatus totalAwardedMarks perQuestionScores")
    .lean()
    .catch(() => null);

  console.log("✅ Ungraded submission:");
  console.log({
    submissionId: subId,
    studentName: updated?.studentName,
    assessmentTitle: updated?.assessmentTitle,
    status: updated?.status,
    grade: updated?.grade,
    aiAnalysisLen: String(updated?.aiAnalysis || "").length,
    automarkStatus: raw?.automarkStatus,
    totalAwardedMarks: raw?.totalAwardedMarks,
    perQuestionScoresCount: Array.isArray(raw?.perQuestionScores) ? raw.perQuestionScores.length : 0,
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("❌ Failed:", e?.message || String(e));
  process.exit(1);
});

