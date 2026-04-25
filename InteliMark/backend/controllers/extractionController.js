const Assessment = require("../models/Assessment");
const Submission = require("../models/Submission");
const SubmissionRaw = require("../models/SubmissionRaw");
const ExtractionJob = require("../models/ExtractionJob");

const { ingestSubmission } = require("../utils/ingestionService");

async function pushLog(jobId, message, level = "info") {
  await ExtractionJob.updateOne({ _id: jobId }, { $push: { logs: { ts: new Date(), level, message } } }).catch(() => {});
}

async function resolveStudentName(subDoc, firestore) {
  const fromDoc = String(subDoc.studentName || "").trim();
  if (fromDoc) return fromDoc;
  const sid = String(subDoc.studentId || "").trim();
  if (!sid) return "Unknown";
  if (!firestore) return sid;
  try {
    const doc = await firestore.collection("users").doc(sid).get();
    if (doc.exists) {
      const data = doc.data() || {};
      return String(data.name || data.displayName || data.email || "").trim() || sid;
    }
  } catch {}
  return sid;
}

// Reuse the same prepare logic as automarkController's prepareOneSubmission, but without touching AutomarkJob.
async function prepareOneSubmission(subDoc, firestore) {
  const subId = String(subDoc._id);

  await SubmissionRaw.findOneAndUpdate(
    { submissionId: subDoc._id },
    {
      $setOnInsert: { submissionId: subDoc._id },
      $set: {
        assessmentId: subDoc.assessmentId,
        courseId: subDoc.courseId,
        teacherId: subDoc.teacherId,
        studentId: subDoc.studentId,
        extractionStatus: "pending",
        extractionError: "",
        faissIngestionStatus: "pending",
        faissIngestionError: "",
      },
    },
    { upsert: true, new: true }
  ).catch(() => {});

  await Submission.findByIdAndUpdate(subId, { $set: { faissIngestionStatus: "pending", faissIngestionError: "" } }).catch(() => {});

  const startedAt = Date.now();
  const result = await ingestSubmission(subId, { enableOcr: true });
  const durationMs = Date.now() - startedAt;
  const chunks = Number(result?.total_chunks_created ?? result?.chunks ?? 0) || 0;
  const embeddings = Number(result?.total_embeddings_created ?? result?.total_vectors_created ?? chunks) || 0;
  const rawText = typeof result?.raw_text === "string" ? result.raw_text : "";
  const contentTypes = Array.isArray(result?.content_types) ? result.content_types : [];

  if (chunks <= 0) {
    const msg = String(result?.error || "Ingestion produced 0 chunks for submission");
    await Submission.findByIdAndUpdate(subId, { $set: { faissIngestionStatus: "failed", faissIngestionError: msg } }).catch(() => {});
    await SubmissionRaw.findOneAndUpdate(
      { submissionId: subDoc._id },
      { $set: { extractionStatus: "failed", extractionError: msg, faissIngestionStatus: "failed", faissIngestionError: msg } }
    ).catch(() => {});
    throw new Error(msg);
  }

  await Submission.findByIdAndUpdate(subId, {
    $set: {
      faissIngestionStatus: "completed",
      faissChunkCount: chunks,
      faissIngestionError: "",
      faissIngestedAt: new Date(),
    },
  }).catch(() => {});

  await SubmissionRaw.findOneAndUpdate(
    { submissionId: subDoc._id },
    {
      $set: {
        faissIngestionStatus: "completed",
        faissChunkCount: chunks,
        numChunks: chunks,
        numEmbeddings: embeddings,
        faissIngestionDurationMs: durationMs,
        faissIngestionError: "",
        faissIngestedAt: new Date(),
        extractionStatus: rawText || contentTypes.length ? "completed" : "skipped",
        extractor: result?.extractor || "",
        rawText,
        charCount: rawText.length,
        pageCount: Number(result?.page_count ?? 0) || 0,
        pageMetadata: Array.isArray(result?.page_metadata) ? result.page_metadata : [],
        visualCount: Number(result?.visual_count ?? 0) || 0,
        equationCount: Number(result?.equation_count ?? 0) || 0,
        contentTypes,
        ocrEnabled: Boolean(result?.ocr_enabled),
        ocrStatus: result?.ocr_status || "",
        ocrError: result?.ocr_error || "",
        ocrCount: Number(result?.ocr_count ?? 0) || 0,
        ocrCharCount: Number(result?.ocr_char_count ?? 0) || 0,
        extractionError: "",
        extractedAt: new Date(),
      },
    }
  ).catch(() => {});
}

exports.startAssessmentExtractBatch = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const teacherId = String(req.body?.teacherId || "").trim();
    const force = Boolean(req.body?.force);
    if (!assessmentId || !teacherId) {
      return res.status(400).json({ success: false, error: "assessmentId and teacherId are required" });
    }

    const assessment = await Assessment.findById(assessmentId).lean();
    if (!assessment) return res.status(404).json({ success: false, error: "Assessment not found" });
    if (String(assessment.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const allSubs = await Submission.find({ assessmentId: assessment._id, teacherId }).sort({ studentId: 1 }).lean();
    const subIds = (allSubs || []).map((s) => s?._id).filter(Boolean);
    const raws = await SubmissionRaw.find({ submissionId: { $in: subIds } })
      .select("submissionId extractionStatus faissIngestionStatus rawText contentTypes")
      .lean()
      .catch(() => []);
    const rawById = new Map((raws || []).map((r) => [String(r?.submissionId || ""), r]));

    const needsPrep = (subDoc) => {
      if (force) return true;
      const r = rawById.get(String(subDoc?._id || ""));
      if (!r) return true;
      const extractionDone = String(r.extractionStatus || "") === "completed" && (String(r.rawText || "").trim() || (Array.isArray(r.contentTypes) && r.contentTypes.length));
      const faissDone = String(r.faissIngestionStatus || "") === "completed";
      return !(extractionDone && faissDone);
    };
    const submissions = (allSubs || []).filter(needsPrep);

    const job = await ExtractionJob.create({
      teacherId,
      assessmentId: assessment._id,
      assessmentTitle: assessment.title || "",
      courseCode: assessment.courseCode || "",
      status: "queued",
      total: submissions.length,
      processed: 0,
      logs: [{ ts: new Date(), level: "info", message: `Queued extraction for ${submissions.length} submission(s).` }],
    });

    res.status(202).json({ success: true, jobId: String(job._id) });

    // Firestore is optional; require lazily to avoid boot issues if admin not configured.
    let firestore = null;
    try {
      firestore = require("../config/firebase-admin").firestore;
    } catch {}

    setImmediate(async () => {
      await ExtractionJob.updateOne({ _id: job._id }, { $set: { status: "running" } }).catch(() => {});
      await pushLog(job._id, `Extraction started for "${assessment.title || assessmentId}".`);

      try {
        for (let i = 0; i < submissions.length; i++) {
          const subDoc = submissions[i];
          const studentName = await resolveStudentName(subDoc, firestore);
          await ExtractionJob.updateOne(
            { _id: job._id },
            { $set: { currentSubmissionId: String(subDoc._id), currentStudentName: studentName } }
          ).catch(() => {});

          await pushLog(job._id, `${studentName}: preparing (extract + FAISS ingest)…`);
          await prepareOneSubmission(subDoc, firestore);
          await pushLog(job._id, `${studentName}: embedded into submission index (vectors created).`);

          await ExtractionJob.updateOne({ _id: job._id }, { $set: { processed: i + 1 } }).catch(() => {});
        }

        await ExtractionJob.updateOne(
          { _id: job._id },
          { $set: { status: "completed", finishedAt: new Date(), currentSubmissionId: "", currentStudentName: "" } }
        ).catch(() => {});
        await pushLog(job._id, "Extraction completed.", "info");
      } catch (e) {
        await ExtractionJob.updateOne(
          { _id: job._id },
          { $set: { status: "failed", error: e?.message || String(e), finishedAt: new Date() } }
        ).catch(() => {});
        await pushLog(job._id, `Extraction failed: ${e?.message || String(e)}`, "error");
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to start extraction batch", details: error.message });
  }
};

exports.getExtractionJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await ExtractionJob.findById(jobId).lean();
    if (!job) return res.status(404).json({ success: false, error: "Job not found" });
    return res.json({ success: true, job });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to fetch job", details: error.message });
  }
};

