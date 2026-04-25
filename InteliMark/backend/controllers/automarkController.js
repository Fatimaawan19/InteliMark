const AutomarkJob = require("../models/AutomarkJob");
const Assessment = require("../models/Assessment");
const Submission = require("../models/Submission");
const SubmissionRaw = require("../models/SubmissionRaw");
const { ingestSubmission } = require("../utils/ingestionService");
const { querySubmissionChunks } = require("../utils/submissionRetrievalService");
const { queryAssessmentReferenceChunks } = require("../utils/assessmentReferenceRetrievalService");
const { firestore } = require("../config/firebase");
const {
  pushAutomarkJobLog: pushLog,
  automarkOneSubmission,
  buildPerQuestionScoresFromReport,
} = require("../utils/automarkLlmService");

async function resolveStudentName(sub) {
  const fromDoc = String(sub.studentName || "").trim();
  if (fromDoc) return fromDoc;
  const sid = String(sub.studentId || "").trim();
  if (!sid) return "Unknown";
  try {
    const doc = await firestore.collection("users").doc(sid).get();
    if (doc.exists) {
      const data = doc.data() || {};
      return String(data.name || data.displayName || data.email || "").trim() || sid;
    }
  } catch {
    // ignore
  }
  return sid;
}

async function resolveStudentEmail(sub) {
  const sid = String(sub.studentId || "").trim();
  if (!sid) return "";
  try {
    const doc = await firestore.collection("users").doc(sid).get();
    if (doc.exists) {
      const data = doc.data() || {};
      return String(data.email || data.mail || "").trim();
    }
  } catch {
    // ignore
  }
  return "";
}

async function prepareOneSubmission(subDoc, opts = {}) {
  const subId = String(subDoc._id);
  const studentEmail = await resolveStudentEmail(subDoc);
  const force = Boolean(opts?.force);

  // Skip re-ingestion if submission is already embedded and extraction completed.
  // This prevents AutoMark from doing extra work on every run.
  try {
    const existingRaw = await SubmissionRaw.findOne({ submissionId: subDoc._id })
      .select("extractionStatus faissIngestionStatus faissChunkCount numChunks charCount rawText contentTypes ocrEnabled ocrStatus studentEmail")
      .lean();
    const alreadyEmbedded =
      existingRaw &&
      existingRaw.extractionStatus === "completed" &&
      existingRaw.faissIngestionStatus === "completed" &&
      Number(existingRaw.faissChunkCount ?? existingRaw.numChunks ?? 0) > 0;
    if (alreadyEmbedded && !force) {
      // Still backfill email if missing
      if (!String(existingRaw.studentEmail || "").trim() && studentEmail) {
        await SubmissionRaw.updateOne({ submissionId: subDoc._id }, { $set: { studentEmail } }).catch(() => {});
      }
      await Submission.findByIdAndUpdate(subId, {
        $set: {
          faissIngestionStatus: "completed",
          faissIngestionError: "",
          status: subDoc.status === "graded" ? subDoc.status : "pending_review",
        },
      }).catch(() => {});
      return;
    }
  } catch {
    // ignore and proceed to ingest
  }

  await SubmissionRaw.findOneAndUpdate(
    { submissionId: subDoc._id },
    {
      $setOnInsert: { submissionId: subDoc._id },
      $set: {
        assessmentId: subDoc.assessmentId,
        courseId: subDoc.courseId,
        teacherId: subDoc.teacherId,
        studentId: subDoc.studentId,
        studentEmail,
        extractionStatus: "pending",
        extractionError: "",
        faissIngestionStatus: "pending",
        faissIngestionError: "",
      },
    },
    { upsert: true, new: true }
  );

  await Submission.findByIdAndUpdate(subId, { $set: { faissIngestionStatus: "pending", faissIngestionError: "" } });

  const startedAt = Date.now();
  const result = await ingestSubmission(subId, { enableOcr: true });
  const durationMs = Date.now() - startedAt;
  const chunks = Number(result?.total_chunks_created ?? result?.chunks ?? 0) || 0;
  const embeddings = Number(result?.total_embeddings_created ?? result?.total_vectors_created ?? chunks) || 0;
  const rawText = typeof result?.raw_text === "string" ? result.raw_text : "";
  const contentTypes = Array.isArray(result?.content_types) ? result.content_types : [];

  // Only consider "embedded successfully" if vectors were actually created.
  // Otherwise fail loudly so the UI doesn't show a false success message.
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
      status: subDoc.status === "graded" ? subDoc.status : "pending_review",
    },
  });

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
  );
}

function buildFeedbackFromAiReport(report) {
  try {
    const r = report && typeof report === "object" ? report : null;
    if (!r) return "";
    const lines = [];
    const totals = r.totals || {};
    const awarded = totals.awarded ?? null;
    const max = totals.max ?? null;
    if (awarded != null && max != null) {
      lines.push(`AutoMark Report: ${awarded}/${max}`);
    } else {
      lines.push("AutoMark Report");
    }
    lines.push("");

    const qs = Array.isArray(r.questions) ? r.questions : [];
    for (const q of qs) {
      const qk = String(q?.questionKey || "").trim() || "Q";
      const a = q?.awardedMarks;
      const m = q?.maxMarks;
      lines.push(`${qk}: ${a ?? "—"}/${m ?? "—"}`);
      const summary = String(q?.summary || "").trim();
      if (summary) lines.push(`Summary: ${summary}`);
      const strengths = Array.isArray(q?.strengths) ? q.strengths.filter(Boolean) : [];
      if (strengths.length) lines.push(`Strengths: ${strengths.slice(0, 5).join("; ")}`);
      const improvements = Array.isArray(q?.improvements) ? q.improvements.filter(Boolean) : [];
      if (improvements.length) lines.push(`Improvements: ${improvements.slice(0, 5).join("; ")}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  } catch {
    return "";
  }
}

exports.startAssessmentAutomarkBatch = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const teacherId = String(req.body?.teacherId || "").trim();
    if (!assessmentId || !teacherId) {
      return res.status(400).json({ success: false, error: "assessmentId and teacherId are required" });
    }

    const assessment = await Assessment.findById(assessmentId)
      .populate({ path: "questions", populate: { path: "cloId" } })
      .lean();
    if (!assessment) return res.status(404).json({ success: false, error: "Assessment not found" });
    if (String(assessment.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
    if (questions.length === 0) {
      return res.status(400).json({ success: false, error: "Assessment has no questions" });
    }

    const submissions = await Submission.find({
      assessmentId: assessment._id,
      teacherId,
      status: { $ne: "graded" },
    })
      .sort({ studentId: 1 })
      .lean();

    // Prevent duplicate runs: if there is an active automark job for this assessment, return it.
    const existingActive = await AutomarkJob.findOne({
      assessmentId: assessment._id,
      teacherId,
      jobType: "automark",
      status: { $in: ["queued", "running"] },
    })
      .select("_id")
      .lean()
      .catch(() => null);
    if (existingActive?._id) {
      return res.status(202).json({ success: true, jobId: String(existingActive._id), reused: true });
    }

    const job = await AutomarkJob.create({
      teacherId,
      assessmentId: assessment._id,
      assessmentTitle: assessment.title || "",
      courseCode: assessment.courseCode || "",
      jobType: "automark",
      status: "queued",
      total: submissions.length,
      processed: 0,
      studentEvidenceExtracted: false,
      sampleAnswerExtracted: false,
      relevantCourseMaterialChunksExtracted: false,
      error: "",
      logs: [{ ts: new Date(), level: "info", message: `Queued batch for ${submissions.length} submission(s).` }],
    });

    res.status(202).json({ success: true, jobId: String(job._id) });

    // Run async
    setImmediate(async () => {
      await AutomarkJob.updateOne({ _id: job._id }, { $set: { status: "running" } }).catch(() => {});
      await pushLog(job._id, `Batch started for "${assessment.title || assessmentId}".`);

      try {
        for (let i = 0; i < submissions.length; i++) {
          const subDoc = submissions[i];
          const studentName = await resolveStudentName(subDoc);
          await AutomarkJob.updateOne(
            { _id: job._id },
            {
              $set: {
                currentSubmissionId: String(subDoc._id),
                currentStudentName: studentName,
              },
            }
          ).catch(() => {});

          // Mark status in submissionRaw so the Review page can show progress/status even if modal closes.
          await SubmissionRaw.findOneAndUpdate(
            { submissionId: subDoc._id },
            {
              $set: {
                submissionId: subDoc._id,
                assessmentId: assessment._id,
                courseId: subDoc.courseId || null,
                teacherId,
                studentId: String(subDoc.studentId || ""),
                automarkStatus: "processing",
                automarkError: "",
              },
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true, new: false }
          ).catch(() => {});

          // AutoMark must be LLM-only. It requires that "Extract Submissions" has already prepared student chunks.
          await pushLog(job._id, `${studentName}: checking extracted student chunks in vector DB…`);
          const retrievalProbeQuery =
            String(questions?.[0]?.questionText || "").trim() ||
            String(assessment?.title || "").trim() ||
            "student submission";
          const existingChunks = await querySubmissionChunks(retrievalProbeQuery, {
            topK: 150,
            submissionId: String(subDoc._id),
            assessmentId: String(assessment._id),
            studentId: String(subDoc.studentId || ""),
          }).catch(() => []);

          if (!Array.isArray(existingChunks) || existingChunks.length === 0) {
            const errMsg = `${studentName}: no extracted chunks found. Run "Extract Submissions" first (then retry AutoMark).`;
            await SubmissionRaw.updateOne(
              { submissionId: subDoc._id },
              { $set: { automarkStatus: "failed", automarkError: errMsg, automarkedAt: new Date() } }
            ).catch(() => {});
            throw new Error(errMsg);
          }
          await pushLog(job._id, `${studentName}: found ${existingChunks.length} chunk(s) → OK.`);
          await AutomarkJob.updateOne({ _id: job._id }, { $set: { studentEvidenceExtracted: true } }).catch(() => {});

          await pushLog(job._id, `${studentName}: LLM auto-marking…`);
          const report = await automarkOneSubmission(subDoc, assessment, questions, job._id);

          // Persist per-question scores + full report into submissionRaw (atomic-ish with submission update already done).
          try {
            const perQuestionScores = buildPerQuestionScoresFromReport(report);

            await SubmissionRaw.updateOne(
              { submissionId: subDoc._id },
              {
                $set: {
                  automarkStatus: "completed",
                  automarkError: "",
                  automarkedAt: new Date(),
                  automarkReport: report,
                  perQuestionScores,
                  totalAwardedMarks: Number(report?.totals?.awarded ?? 0) || 0,
                },
              }
            ).catch(() => {});
          } catch (_) {}
          await pushLog(job._id, `${studentName}: auto-marked.`);

          await AutomarkJob.updateOne(
            { _id: job._id },
            { $set: { processed: i + 1 } }
          ).catch(() => {});
        }

        await AutomarkJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: "completed",
              error: "",
              finishedAt: new Date(),
              currentSubmissionId: "",
              currentStudentName: "",
            },
          }
        ).catch(() => {});
        await pushLog(job._id, "Batch completed.", "info");
      } catch (e) {
        await AutomarkJob.updateOne(
          { _id: job._id },
          { $set: { status: "failed", error: e?.message || String(e), finishedAt: new Date() } }
        ).catch(() => {});
        await pushLog(job._id, `Batch failed: ${e?.message || String(e)}`, "error");
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to start batch", details: error.message });
  }
};

exports.startAssessmentRemarkBatch = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const teacherId = String(req.body?.teacherId || "").trim();
    // Re-mark should always overwrite existing submission vectors so results are reproducible.
    // (The python ingestion deletes by submission_id before re-adding chunks.)
    const forceReingest = true;
    if (!assessmentId || !teacherId) {
      return res.status(400).json({ success: false, error: "assessmentId and teacherId are required" });
    }

    const assessment = await Assessment.findById(assessmentId)
      .populate({ path: "questions", populate: { path: "cloId" } })
      .lean();
    if (!assessment) return res.status(404).json({ success: false, error: "Assessment not found" });
    if (String(assessment.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
    if (questions.length === 0) {
      return res.status(400).json({ success: false, error: "Assessment has no questions" });
    }

    // Re-mark ALL submissions (including graded) and overwrite aiAnalysis fields (no duplicates).
    const submissions = await Submission.find({
      assessmentId: assessment._id,
      teacherId,
    })
      .sort({ studentId: 1 })
      .lean();

    const job = await AutomarkJob.create({
      teacherId,
      assessmentId: assessment._id,
      assessmentTitle: assessment.title || "",
      courseCode: assessment.courseCode || "",
      jobType: "remark",
      status: "queued",
      total: submissions.length,
      processed: 0,
      logs: [{ ts: new Date(), level: "info", message: `Queued re-mark for ${submissions.length} submission(s).` }],
    });

    res.status(202).json({ success: true, jobId: String(job._id) });

    setImmediate(async () => {
      await AutomarkJob.updateOne({ _id: job._id }, { $set: { status: "running" } }).catch(() => {});
      await pushLog(job._id, `Re-mark started for "${assessment.title || assessmentId}".`);

      try {
        for (let i = 0; i < submissions.length; i++) {
          const subDoc = submissions[i];
          const studentName = await resolveStudentName(subDoc);
          await AutomarkJob.updateOne(
            { _id: job._id },
            { $set: { currentSubmissionId: String(subDoc._id), currentStudentName: studentName } }
          ).catch(() => {});

          await pushLog(job._id, `${studentName}: re-ingesting (overwrite old chunks)…`);
          await prepareOneSubmission(subDoc, { force: Boolean(forceReingest) });
          await pushLog(job._id, `${studentName}: embedded into submission index (vectors replaced).`);

          await pushLog(job._id, `${studentName}: LLM re-marking…`);
          await automarkOneSubmission(subDoc, assessment, questions, job._id);
          await pushLog(job._id, `${studentName}: re-marked (AI report replaced).`);

          await AutomarkJob.updateOne({ _id: job._id }, { $set: { processed: i + 1 } }).catch(() => {});
        }

        await AutomarkJob.updateOne(
          { _id: job._id },
          { $set: { status: "completed", finishedAt: new Date(), currentSubmissionId: "", currentStudentName: "" } }
        ).catch(() => {});
        await pushLog(job._id, "Re-mark completed.", "info");
      } catch (e) {
        await AutomarkJob.updateOne(
          { _id: job._id },
          { $set: { status: "failed", error: e?.message || String(e), finishedAt: new Date() } }
        ).catch(() => {});
        await pushLog(job._id, `Re-mark failed: ${e?.message || String(e)}`, "error");
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to start re-mark", details: error.message });
  }
};

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

    // Extraction should prepare chunks for any submission that is missing extraction/FAISS vectors,
    // even if it's already graded. Otherwise "Extract" often queues 0.
    const allSubs = await Submission.find({
      assessmentId: assessment._id,
      teacherId,
    })
      .sort({ studentId: 1 })
      .lean();

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

    const job = await AutomarkJob.create({
      teacherId,
      assessmentId: assessment._id,
      assessmentTitle: assessment.title || "",
      courseCode: assessment.courseCode || "",
      jobType: "ExtractStudentChunks",
      status: "queued",
      total: submissions.length,
      processed: 0,
      logs: [{ ts: new Date(), level: "info", message: `Queued extraction for ${submissions.length} submission(s).` }],
    });

    res.status(202).json({ success: true, jobId: String(job._id) });

    setImmediate(async () => {
      await AutomarkJob.updateOne({ _id: job._id }, { $set: { status: "running" } }).catch(() => {});
      await pushLog(job._id, `Extraction started for "${assessment.title || assessmentId}".`);

      try {
        for (let i = 0; i < submissions.length; i++) {
          const subDoc = submissions[i];
          const studentName = await resolveStudentName(subDoc);
          await AutomarkJob.updateOne(
            { _id: job._id },
            { $set: { currentSubmissionId: String(subDoc._id), currentStudentName: studentName } }
          ).catch(() => {});

          await pushLog(job._id, `${studentName}: preparing (extract + FAISS ingest)…`);
          await prepareOneSubmission(subDoc);
          await pushLog(job._id, `${studentName}: embedded into submission index (vectors created).`);

          await AutomarkJob.updateOne({ _id: job._id }, { $set: { processed: i + 1 } }).catch(() => {});
        }

        await AutomarkJob.updateOne(
          { _id: job._id },
          { $set: { status: "completed", finishedAt: new Date(), currentSubmissionId: "", currentStudentName: "" } }
        ).catch(() => {});
        await pushLog(job._id, "Extraction completed.", "info");
      } catch (e) {
        await AutomarkJob.updateOne(
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

exports.startAssessmentPublishBatch = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const teacherId = String(req.body?.teacherId || "").trim();
    if (!assessmentId || !teacherId) {
      return res.status(400).json({ success: false, error: "assessmentId and teacherId are required" });
    }

    const assessment = await Assessment.findById(assessmentId).lean();
    if (!assessment) return res.status(404).json({ success: false, error: "Assessment not found" });
    if (String(assessment.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const submissions = await Submission.find({
      assessmentId: assessment._id,
      teacherId,
      status: { $ne: "graded" },
      aiAnalysis: { $exists: true, $ne: "" },
    })
      .sort({ studentId: 1 })
      .lean();

    const job = await AutomarkJob.create({
      teacherId,
      assessmentId: assessment._id,
      assessmentTitle: assessment.title || "",
      courseCode: assessment.courseCode || "",
      jobType: "publish",
      status: "queued",
      total: submissions.length,
      processed: 0,
      logs: [{ ts: new Date(), level: "info", message: `Queued publish for ${submissions.length} submission(s).` }],
    });

    res.status(202).json({ success: true, jobId: String(job._id) });

    setImmediate(async () => {
      await AutomarkJob.updateOne({ _id: job._id }, { $set: { status: "running" } }).catch(() => {});
      await pushLog(job._id, `Publish started for "${assessment.title || assessmentId}".`);

      try {
        const { notifySubmissionGraded } = require("../utils/notificationService");

        for (let i = 0; i < submissions.length; i++) {
          const subDoc = submissions[i];
          const studentName = await resolveStudentName(subDoc);
          await AutomarkJob.updateOne(
            { _id: job._id },
            { $set: { currentSubmissionId: String(subDoc._id), currentStudentName: studentName } }
          ).catch(() => {});

          let reportObj = null;
          try {
            reportObj = subDoc.aiAnalysis ? JSON.parse(String(subDoc.aiAnalysis)) : null;
          } catch {
            reportObj = null;
          }
          const gradeToSave =
            Number(subDoc.aiGradingSuggestion ?? reportObj?.totals?.awarded ?? subDoc.grade ?? 0) || 0;
          const feedback = buildFeedbackFromAiReport(reportObj);

          await pushLog(job._id, `${studentName}: publishing grade ${gradeToSave}…`);
          await Submission.updateOne(
            { _id: subDoc._id },
            {
              $set: {
                grade: gradeToSave,
                feedback: feedback || subDoc.feedback || "",
                gradedBy: teacherId,
                gradedAt: new Date(),
                status: "graded",
              },
            }
          );

          // Notify student (best-effort)
          try {
            const fullSub = await Submission.findById(subDoc._id);
            await notifySubmissionGraded(fullSub, assessment, String(subDoc.studentId || ""));
          } catch (e) {
            await pushLog(job._id, `${studentName}: notify failed (${e?.message || String(e)})`, "warn");
          }

          await pushLog(job._id, `${studentName}: published.`);
          await AutomarkJob.updateOne({ _id: job._id }, { $set: { processed: i + 1 } }).catch(() => {});
        }

        await AutomarkJob.updateOne(
          { _id: job._id },
          { $set: { status: "completed", finishedAt: new Date(), currentSubmissionId: "", currentStudentName: "" } }
        ).catch(() => {});
        await pushLog(job._id, "Publish completed.", "info");
      } catch (e) {
        await AutomarkJob.updateOne(
          { _id: job._id },
          { $set: { status: "failed", error: e?.message || String(e), finishedAt: new Date() } }
        ).catch(() => {});
        await pushLog(job._id, `Publish failed: ${e?.message || String(e)}`, "error");
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to start publish batch", details: error.message });
  }
};

exports.getAutomarkJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await AutomarkJob.findById(jobId).lean();
    if (!job) return res.status(404).json({ success: false, error: "Job not found" });
    return res.json({ success: true, job });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to fetch job", details: error.message });
  }
};

