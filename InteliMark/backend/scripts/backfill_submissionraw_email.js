require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Submission = require("../models/Submission");
const SubmissionRaw = require("../models/SubmissionRaw");
const { firestore } = require("../config/firebase");

function buildDirectMongoUriFromSrv(srvUri, hostsCsv) {
  if (!srvUri || typeof srvUri !== "string") return null;
  if (!srvUri.startsWith("mongodb+srv://")) return null;
  if (!hostsCsv || typeof hostsCsv !== "string" || !hostsCsv.trim()) return null;

  const withoutScheme = srvUri.replace(/^mongodb\+srv:\/\//, "");
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

async function connectMongoWithFallback(mongoUri) {
  const options = { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 };
  try {
    await mongoose.connect(mongoUri, options);
    return { uri: mongoUri, usedFallback: false };
  } catch (err) {
    const msg = String(err?.message || "");
    const isSrvDnsError =
      msg.includes("querySrv") || msg.includes("_mongodb._tcp") || err?.code === "ECONNREFUSED";
    const directUri = buildDirectMongoUriFromSrv(mongoUri, process.env.MONGO_HOSTS);
    if (isSrvDnsError && directUri) {
      console.warn("⚠️  SRV DNS lookup failed. Retrying with direct host seed list...");
      await mongoose.connect(directUri, options);
      return { uri: directUri, usedFallback: true };
    }
    throw err;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--submissionId") args.submissionId = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

async function resolveStudentEmail(studentId) {
  const sid = String(studentId || "").trim();
  if (!sid) return "";
  try {
    const doc = await firestore.collection("users").doc(sid).get();
    if (doc.exists) {
      const data = doc.data() || {};
      return String(data.email || data.mail || "").trim();
    }
  } catch (e) {
    console.warn("⚠️  Firestore lookup failed:", e?.message || String(e));
  }
  return "";
}

async function main() {
  const { submissionId, help } = parseArgs(process.argv);
  if (help || !submissionId) {
    console.log("Usage: node scripts/backfill_submissionraw_email.js --submissionId <Submission _id>");
    process.exit(0);
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("Missing MONGO_URI/MONGODB_URI in backend .env");

  const conn = await connectMongoWithFallback(mongoUri);
  console.log("✅ Connected to MongoDB");
  if (conn.usedFallback) console.log("ℹ️  Connected using direct host seed list (SRV fallback).");

  const sub = await Submission.findById(submissionId).select("_id studentId").lean();
  if (!sub) throw new Error(`Submission not found: ${submissionId}`);

  const studentEmail = await resolveStudentEmail(sub.studentId);
  if (!studentEmail) {
    console.log("⚠️  No email found in Firestore for studentId:", String(sub.studentId || ""));
  }

  const updated = await SubmissionRaw.findOneAndUpdate(
    { submissionId: sub._id },
    { $set: { studentEmail } },
    { new: true }
  ).lean();

  if (!updated) throw new Error(`SubmissionRaw not found for submissionId: ${submissionId}`);

  console.log("✅ Updated SubmissionRaw");
  console.log("  submissionId:", String(updated.submissionId));
  console.log("  studentId:", String(updated.studentId || ""));
  console.log("  studentEmail:", String(updated.studentEmail || ""));
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e?.message || String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });

