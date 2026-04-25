#!/usr/bin/env node
/**
 * Backfill SubmissionRaw automark fields from Submission.aiAnalysis.
 *
 * Use when submissions were graded via POST /api/submissions/:id/automark
 * (or legacy paths) that stored JSON only on Submission, not SubmissionRaw.
 *
 * Usage:
 *   node scripts/backfill_submissionraw_from_aianalysis.js --submissionId <id>
 *   node scripts/backfill_submissionraw_from_aianalysis.js --assessmentId <id>
 *   node scripts/backfill_submissionraw_from_aianalysis.js --all --limit 200
 *   node scripts/backfill_submissionraw_from_aianalysis.js --assessmentId <id> --dry-run
 *   node scripts/backfill_submissionraw_from_aianalysis.js --submissionId <id> --force
 *
 * Options:
 *   --dry-run     Print actions only; no writes.
 *   --force       Update even if SubmissionRaw already has automarkStatus=completed and report.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Submission = require("../models/Submission");
const SubmissionRaw = require("../models/SubmissionRaw");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--submissionId") out.submissionId = argv[++i];
    else if (a === "--assessmentId") out.assessmentId = argv[++i];
    else if (a === "--all") out.all = true;
    else if (a === "--limit") out.limit = Math.max(1, parseInt(argv[++i], 10) || 100);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--force") out.force = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  if (!out.limit) out.limit = 500;
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

/** Pull first top-level JSON object from a string (handles markdown fences / extra text). */
function extractFirstJsonObject(text) {
  const s = String(text || "").trim();
  if (!s) return null;

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : s;

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i += 1) {
    const c = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"' && !escape) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth += 1;
    if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseAiAnalysis(aiAnalysis) {
  if (aiAnalysis == null) return null;
  const raw = typeof aiAnalysis === "string" ? aiAnalysis : JSON.stringify(aiAnalysis);
  if (!String(raw).trim()) return null;
  try {
    return JSON.parse(String(raw).trim());
  } catch {
    return extractFirstJsonObject(raw);
  }
}

function buildPerQuestionScores(report) {
  const qs = Array.isArray(report?.questions) ? report.questions : [];
  return qs.map((q) => {
    const coverage = Array.isArray(q?.coverage) ? q.coverage : [];
    const uncovered = coverage
      .filter((c) => c && c.covered === false)
      .map((c) => String(c.point || "").trim())
      .filter(Boolean);
    const improvements = Array.isArray(q?.improvements)
      ? q.improvements.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const fromLlm = Array.isArray(q?.mistakes) ? q.mistakes : [];
    const mistakes =
      fromLlm.length > 0
        ? fromLlm
        : [...uncovered, ...improvements]
            .slice(0, 10)
            .map((m) => ({ type: "note", message: m, suggestedCorrection: "", evidenceQuote: "" }));
    return {
      questionKey: q?.questionKey || "",
      awardedMarks: Number(q?.awardedMarks ?? 0) || 0,
      maxMarks: Number(q?.maxMarks ?? 0) || 0,
      confidence: Number(q?.confidence ?? 0) || 0,
      summary: String(q?.summary || q?.studentAnswerSummary || "").trim(),
      mistakes,
    };
  });
}

function needsBackfill(raw, force) {
  if (force) return true;
  if (!raw) return true;
  const status = String(raw.automarkStatus || "missing");
  const hasReport = raw.automarkReport != null && typeof raw.automarkReport === "object";
  const pq = Array.isArray(raw.perQuestionScores) ? raw.perQuestionScores.length : 0;
  if (status === "completed" && hasReport && pq > 0) return false;
  return status === "missing" || !hasReport || pq === 0;
}

async function backfillOne(sub, { dryRun, force }) {
  const report = parseAiAnalysis(sub.aiAnalysis);
  if (!report || !Array.isArray(report.questions) || report.questions.length === 0) {
    return { ok: false, reason: "no_valid_report" };
  }

  const raw = await SubmissionRaw.findOne({ submissionId: sub._id }).lean().catch(() => null);
  if (!needsBackfill(raw, force)) {
    return { ok: false, reason: "already_filled" };
  }

  const perQuestionScores = buildPerQuestionScores(report);
  const totalAwardedMarks = Number(report?.totals?.awarded ?? 0) || 0;
  const teacherId = String(sub.teacherId || "").trim();

  const setDoc = {
    assessmentId: sub.assessmentId || null,
    courseId: sub.courseId || null,
    teacherId,
    studentId: String(sub.studentId || ""),
    automarkStatus: "completed",
    automarkError: "",
    automarkedAt: new Date(),
    automarkReport: report,
    perQuestionScores,
    totalAwardedMarks,
  };

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      submissionId: String(sub._id),
      questions: perQuestionScores.length,
      totalAwardedMarks,
    };
  }

  await SubmissionRaw.findOneAndUpdate(
    { submissionId: sub._id },
    {
      $setOnInsert: { submissionId: sub._id },
      $set: setDoc,
    },
    { upsert: true }
  );

  return {
    ok: true,
    submissionId: String(sub._id),
    questions: perQuestionScores.length,
    totalAwardedMarks,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      [
        "Backfill SubmissionRaw from Submission.aiAnalysis.",
        "",
        "  node scripts/backfill_submissionraw_from_aianalysis.js --submissionId <id>",
        "  node scripts/backfill_submissionraw_from_aianalysis.js --assessmentId <id>",
        "  node scripts/backfill_submissionraw_from_aianalysis.js --all --limit 200",
        "  node scripts/backfill_submissionraw_from_aianalysis.js --assessmentId <id> --dry-run",
        "  node scripts/backfill_submissionraw_from_aianalysis.js --submissionId <id> --force",
      ].join("\n")
    );
    process.exit(0);
  }

  const hasSubmission = Boolean(args.submissionId);
  const hasAssessment = Boolean(args.assessmentId);
  const useAll = Boolean(args.all);
  if ((hasSubmission ? 1 : 0) + (hasAssessment ? 1 : 0) + (useAll ? 1 : 0) !== 1) {
    throw new Error("Specify exactly one of: --submissionId, --assessmentId, or --all");
  }

  await connectMongo();

  /** @type {import("mongoose").FilterQuery<any>} */
  const filter = {
    aiAnalysis: { $exists: true, $nin: [null, ""] },
  };
  if (hasSubmission) {
    filter._id = args.submissionId;
  } else if (hasAssessment) {
    filter.assessmentId = args.assessmentId;
  }

  const cursor = Submission.find(filter)
    .select("_id assessmentId courseId teacherId studentId aiAnalysis")
    .sort({ updatedAt: -1 })
    .limit(useAll ? args.limit : hasAssessment ? args.limit : 1)
    .cursor();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for await (const sub of cursor) {
    try {
      const r = await backfillOne(sub, { dryRun: args.dryRun, force: args.force });
      if (r.ok) {
        updated += 1;
        console.log(args.dryRun ? "[dry-run]" : "✅", r);
      } else {
        skipped += 1;
        if (r.reason === "no_valid_report") {
          console.log("⏭ skip (no parseable report)", String(sub._id));
        } else {
          console.log("⏭ skip", r.reason, String(sub._id));
        }
      }
    } catch (e) {
      failed += 1;
      console.error("❌", String(sub._id), e?.message || String(e));
    }
  }

  console.log("\nDone.", { updated, skipped, failed, dryRun: Boolean(args.dryRun) });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("❌ Failed:", e?.message || String(e));
  process.exit(1);
});
