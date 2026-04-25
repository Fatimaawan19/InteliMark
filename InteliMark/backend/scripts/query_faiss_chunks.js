#!/usr/bin/env node

/**
 * Query FAISS chunks with metadata (submission + assessment reference).
 *
 * Examples:
 *  node scripts/query_faiss_chunks.js --query "reinforcement learning" --submissionId 69e73e79ff23e0a5bde63a7f --topK 8
 *  node scripts/query_faiss_chunks.js --query "marking rubric" --assessmentId 69e4f8846c4c7340f7f4f64f --referenceType rubric --questionId ALL --topK 8
 *  node scripts/query_faiss_chunks.js --query "Q1 answer" --assessmentId 69e4f8846c4c7340f7f4f64f --referenceType sample_answer --questionId Q1 --topK 8
 *  node scripts/query_faiss_chunks.js --query "Q1 answer" --both --submissionId 69e73e79ff23e0a5bde63a7f --assessmentId 69e4f8846c4c7340f7f4f64f --questionId Q1 --topK 5
 */

const { querySubmissionChunks } = require("../utils/submissionRetrievalService");
const { queryAssessmentReferenceChunks } = require("../utils/assessmentReferenceRetrievalService");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--query" || a === "-q") args.query = argv[++i];
    else if (a === "--topK" || a === "--k") args.topK = Number(argv[++i]);
    else if (a === "--submissionId") args.submissionId = argv[++i];
    else if (a === "--assessmentId") args.assessmentId = argv[++i];
    else if (a === "--studentId") args.studentId = argv[++i];
    else if (a === "--questionId") args.questionId = argv[++i];
    else if (a === "--referenceType") args.referenceType = argv[++i];
    else if (a === "--submission") args.mode = "submission";
    else if (a === "--reference") args.mode = "reference";
    else if (a === "--both") args.mode = "both";
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(
    [
      "",
      "Query FAISS chunks (text + metadata)",
      "",
      "Usage:",
      '  node scripts/query_faiss_chunks.js --query "..." [--topK 8] [--submission|--reference|--both]',
      "",
      "Submission filters:",
      "  --submissionId <id>   filter to one submission",
      "  --assessmentId <id>   filter by assessment (submission side)",
      "  --studentId <id>      filter by studentId (submission side)",
      "",
      "Reference filters:",
      "  --assessmentId <id>               required for reference queries",
      "  --questionId <Q1|ALL>             optional",
      "  --referenceType <sample_answer|rubric|clo>  optional",
      "",
      "Examples:",
      '  node scripts/query_faiss_chunks.js --query "reinforcement learning" --submissionId <subId> --topK 8',
      '  node scripts/query_faiss_chunks.js --query "rubric" --reference --assessmentId <assessId> --referenceType rubric --questionId ALL',
      "",
    ].join("\n")
  );
}

function truncate(s, n) {
  const t = String(s || "");
  if (t.length <= n) return t;
  return t.slice(0, n) + "…";
}

function printResults(title, results) {
  console.log("\n" + "=".repeat(100));
  console.log(title);
  console.log("=".repeat(100));
  if (!Array.isArray(results) || results.length === 0) {
    console.log("(no matches)");
    return;
  }
  results.forEach((r, idx) => {
    const sim = Number(r?.similarity ?? 0);
    console.log(`\n#${idx + 1} similarity=${sim.toFixed(3)} id=${r?.id || ""}`);
    console.log("metadata:", JSON.stringify(r?.metadata || {}, null, 2));
    console.log("text:", truncate(r?.text || "", 600));
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.query) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const topK = Number.isFinite(args.topK) && args.topK > 0 ? args.topK : 8;
  const mode = args.mode || "both";

  const tasks = [];

  if (mode === "submission" || mode === "both") {
    tasks.push(
      querySubmissionChunks(String(args.query), {
        topK,
        submissionId: args.submissionId || null,
        assessmentId: args.assessmentId || null,
        studentId: args.studentId || null,
      }).then((rows) => ({ kind: "submission", rows }))
    );
  }

  if (mode === "reference" || mode === "both") {
    if (!args.assessmentId) {
      throw new Error("--assessmentId is required for reference queries");
    }
    tasks.push(
      queryAssessmentReferenceChunks(String(args.query), {
        topK,
        assessmentId: args.assessmentId || null,
        questionId: args.questionId || null,
        referenceType: args.referenceType || null,
      }).then((rows) => ({ kind: "reference", rows }))
    );
  }

  const done = await Promise.all(tasks);
  for (const d of done) {
    if (d.kind === "submission") {
      printResults("SUBMISSION INDEX (faiss_submissions_index)", d.rows);
    } else {
      printResults("ASSESSMENT REFERENCE INDEX (faiss_assessment_reference_index)", d.rows);
    }
  }
}

main().catch((e) => {
  console.error("❌ Failed:", e?.message || String(e));
  process.exitCode = 1;
});

