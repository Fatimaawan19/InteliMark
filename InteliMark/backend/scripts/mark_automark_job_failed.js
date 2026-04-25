#!/usr/bin/env node
/**
 * Force-close a stuck automark job by marking it failed.
 *
 * Usage:
 *  node scripts/mark_automark_job_failed.js --jobId <id> [--reason "text"]
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const AutomarkJob = require("../models/AutomarkJob");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--jobId") out.jobId = argv[++i];
    else if (a === "--reason") out.reason = argv[++i];
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
    console.log('Usage: node scripts/mark_automark_job_failed.js --jobId <id> [--reason "text"]');
    process.exit(args.help ? 0 : 1);
  }

  await connectMongo();
  const reason = String(args.reason || "Manually closed stuck job").trim();

  const job = await AutomarkJob.findById(args.jobId);
  if (!job) throw new Error(`Job not found: ${args.jobId}`);

  job.status = "failed";
  job.error = reason;
  job.finishedAt = new Date();
  job.currentSubmissionId = "";
  job.currentStudentName = "";
  job.logs = Array.isArray(job.logs) ? job.logs : [];
  job.logs.push({ ts: new Date(), level: "error", message: `Forced failed: ${reason}` });
  await job.save();

  console.log("✅ Marked job failed:", { jobId: String(job._id), status: job.status, error: job.error });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("❌ Failed:", e?.message || String(e));
  process.exit(1);
});

