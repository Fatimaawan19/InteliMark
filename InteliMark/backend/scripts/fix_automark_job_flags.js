#!/usr/bin/env node
/**
 * Recompute and patch automark job flags for a given jobId.
 *
 * Usage:
 *  node scripts/fix_automark_job_flags.js --jobId <id>
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const AutomarkJob = require("../models/AutomarkJob");
const Assessment = require("../models/Assessment");
const Submission = require("../models/Submission");
const { querySubmissionChunks } = require("../utils/submissionRetrievalService");
const { queryAssessmentReferenceChunks } = require("../utils/assessmentReferenceRetrievalService");
const { queryCourseMaterialChunks } = require("../utils/courseMaterialRetrievalService");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--jobId") out.jobId = argv[++i];
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
  return (
    `mongodb://${creds}@${hosts}${pathAndQuery}` +
    `${hasQuery ? "&" : "?"}tls=true` +
    `${needsAuthSource ? "&authSource=admin" : ""}`
  );
}

async function connectMongo() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) throw new Error("Missing MONGO_URI in backend/.env");
  const opts = { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 };
  try {
    await mongoose.connect(MONGO_URI, opts);
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
  if (args.help || !args.jobId) {
    console.log("Usage: node scripts/fix_automark_job_flags.js --jobId <id>");
    process.exit(args.help ? 0 : 1);
  }

  await connectMongo();
  const job = await AutomarkJob.findById(args.jobId).lean();
  if (!job) throw new Error(`Job not found: ${args.jobId}`);

  const assessmentId = String(job.assessmentId || "");
  // Avoid populate to prevent schema registration issues; we only need a retrieval query.
  const assessment = await Assessment.findById(assessmentId).lean();
  const submissions = await Submission.find({ assessmentId, teacherId: job.teacherId }).sort({ submittedAt: -1 }).lean();
  const sub = submissions?.[0];
  const retrievalQuery = String(assessment?.title || "student submission").trim();

  let studentEvidenceExtracted = false;
  let sampleAnswerExtracted = false;
  let relevantCourseMaterialChunksExtracted = false;

  if (sub?._id) {
    const studentChunks = await querySubmissionChunks(retrievalQuery, {
      topK: 25,
      submissionId: String(sub._id),
      assessmentId: String(assessmentId),
      studentId: String(sub.studentId || ""),
    }).catch(() => []);
    studentEvidenceExtracted = Array.isArray(studentChunks) && studentChunks.length > 0;

    const sampleChunks = await queryAssessmentReferenceChunks(retrievalQuery, {
      topK: 10,
      assessmentId: String(assessmentId),
      questionId: "Q1",
      referenceType: "sample_answer",
    }).catch(() => []);
    sampleAnswerExtracted = Array.isArray(sampleChunks) && sampleChunks.length > 0;

    const courseId =
      sub.courseId && typeof sub.courseId === "object" && sub.courseId._id ? String(sub.courseId._id) : String(sub.courseId || "");
    const matChunks = courseId ? await queryCourseMaterialChunks(retrievalQuery, { topK: 8, courseId }).catch(() => []) : [];
    relevantCourseMaterialChunksExtracted = Array.isArray(matChunks) && matChunks.length > 0;
  }

  const set = {
    studentEvidenceExtracted,
    sampleAnswerExtracted,
    relevantCourseMaterialChunksExtracted,
  };
  if (String(job.status || "") === "completed") {
    set.error = "";
  }

  await AutomarkJob.updateOne({ _id: job._id }, { $set: set }).catch(() => {});

  console.log("✅ Updated job flags:", { jobId: String(job._id), status: job.status, ...set });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("❌ Failed:", e?.message || String(e));
  process.exit(1);
});

