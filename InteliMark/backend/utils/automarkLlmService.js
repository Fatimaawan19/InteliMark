/**
 * Single code path for Ollama-based AutoMark (batch, re-mark, and single-submission API).
 */

const AutomarkJob = require("../models/AutomarkJob");
const Submission = require("../models/Submission");
const SubmissionRaw = require("../models/SubmissionRaw");
const { queryCourseMaterialChunks } = require("./courseMaterialRetrievalService");
const { querySubmissionChunks } = require("./submissionRetrievalService");
const { queryAssessmentReferenceChunks } = require("./assessmentReferenceRetrievalService");

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

function __dbg(location, message, data, hypothesisId) {
  // #region agent log
  fetch('http://127.0.0.1:7581/ingest/941c1564-77f4-42f2-9551-e2a5a14ad240',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0f5671'},body:JSON.stringify({sessionId:'0f5671',runId:'pre-fix',hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

function extractFirstJsonObject(text) {
  if (!text) return null;
  const raw = String(text);
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function pushAutomarkJobLog(jobId, message, level = "info") {
  if (!jobId) return;
  await AutomarkJob.updateOne(
    { _id: jobId },
    { $push: { logs: { ts: new Date(), level, message } } }
  ).catch(() => {});
}

async function generateJsonWithRetries({ prompt, options, maxRetries = 2 }) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      __dbg('automarkLlmService.js:generateJsonWithRetries', 'ollama_request_attempt', { attempt, model: OLLAMA_MODEL, promptLen: String(prompt||'').length, options: options || null }, 'H2');
      const timeoutMs = Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS || 180000) || 180000;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: false,
          options,
        }),
      });
      clearTimeout(t);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Ollama error (${response.status})`);
      const rawResp = String(data?.response || data?.message || "");
      __dbg('automarkLlmService.js:generateJsonWithRetries', 'ollama_response_received', { attempt, ok: response.ok, status: response.status, respLen: rawResp.length }, 'H2');
      const parsed = extractFirstJsonObject(rawResp);
      if (!parsed) throw new Error("Model did not return valid JSON");
      return parsed;
    } catch (e) {
      lastErr = e?.name === "AbortError" ? new Error("Ollama request timed out") : e;
      __dbg('automarkLlmService.js:generateJsonWithRetries', 'ollama_request_error', { attempt, error: String(lastErr?.message || lastErr) }, 'H2');
    }
  }
  throw lastErr || new Error("Model failed");
}

function normalizeMistake(m) {
  if (!m || typeof m !== "object") return null;

  const type = String(m.type || "").trim() || "note";

  // New preferred shape.
  const startIdx = Number.isFinite(m?.start_index) ? Number(m.start_index) : null;
  const endIdx = Number.isFinite(m?.end_index) ? Number(m.end_index) : null;
  const textSpan = String(m?.text_span || "").trim();
  const feedback = String(m?.feedback || m?.message || "").trim();
  const suggestion = String(m?.suggestion || m?.suggestedCorrection || "").trim();

  // Back-compat: older keys spanStart/spanEnd/evidenceQuote.
  const legacyStart = Number.isFinite(m?.spanStart) ? Number(m.spanStart) : null;
  const legacyEnd = Number.isFinite(m?.spanEnd) ? Number(m.spanEnd) : null;
  const legacySpan = String(m?.evidenceQuote || "").trim();

  return {
    type,
    text_span: textSpan || legacySpan || "",
    start_index: startIdx != null ? startIdx : legacyStart,
    end_index: endIdx != null ? endIdx : legacyEnd,
    feedback,
    suggestion,
  };
}

/**
 * Build per-question UI rows from a full automark report (same shape as batch controller).
 */
function buildPerQuestionScoresFromReport(report) {
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
    const fromLlmRaw = Array.isArray(q?.mistakes) ? q.mistakes : [];
    const fromLlm = fromLlmRaw.map(normalizeMistake).filter(Boolean);
    const mistakes =
      fromLlm.length > 0
        ? fromLlm
        : [...uncovered, ...improvements]
            .slice(0, 10)
            .map((msg) => ({
              type: "note",
              text_span: "",
              start_index: null,
              end_index: null,
              feedback: String(msg || "").trim(),
              suggestion: "",
            }));
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

/**
 * Run one full LLM grading pass for a submission (all questions), update Submission, return report.
 * @param {object} subDoc — submission doc (lean or Mongoose)
 * @param {object} assessment — lean assessment with questions
 * @param {object[]} questions — assessment.questions array
 * @param {import("mongoose").Types.ObjectId|string|null} jobId — optional AutomarkJob for logs / flags
 */
async function automarkOneSubmission(subDoc, assessment, questions, jobId = null) {
  const assessmentId = String(assessment._id);
  const report = {
    submissionId: String(subDoc._id),
    assessmentId,
    assessmentTitle: assessment.title || "",
    generatedAt: new Date().toISOString(),
    model: OLLAMA_MODEL,
    questions: [],
    totals: {
      awarded: 0,
      max: typeof subDoc.maxGrade === "number" ? subDoc.maxGrade : Number(assessment.totalMarks || 0) || 0,
    },
    confidence: null,
  };

  __dbg('automarkLlmService.js:automarkOneSubmission', 'start_submission', {
    submissionId: String(subDoc?._id || ''),
    assessmentId,
    questionCount: Array.isArray(questions) ? questions.length : 0,
    totalsMax: report?.totals?.max ?? null,
    assessmentType: String(assessment?.type || ''),
  }, 'H1');

  let confidenceSum = 0;
  let confidenceCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] || {};
    const qKey = `Q${i + 1}`;
    const maxMarks = Number(q.marks ?? 0) || 0;
    const questionText = String(q.questionText || "").trim();
    const questionType = String(q.questionType || "").trim();
    const retrievalQuery = questionText || `${assessment.title || "Assessment"} ${qKey}`;

    if (jobId) {
      await pushAutomarkJobLog(
        jobId,
        `${String(subDoc.studentName || subDoc.studentId || "Student")}: finding evidence chunks for ${qKey}…`
      );
    }

    const [studentChunks, sampleChunks, rubricChunksForQ, rubricChunksAll, cloChunksAll] = await Promise.all([
      querySubmissionChunks(retrievalQuery, {
        topK: 10,
        submissionId: String(subDoc._id),
        assessmentId,
        studentId: String(subDoc.studentId || ""),
      }).catch(() => []),
      queryAssessmentReferenceChunks(retrievalQuery, {
        topK: 10,
        assessmentId,
        questionId: qKey,
        referenceType: "sample_answer",
      }).catch(() => []),
      queryAssessmentReferenceChunks(retrievalQuery, {
        topK: 10,
        assessmentId,
        questionId: qKey,
        referenceType: "rubric",
      }).catch(() => []),
      queryAssessmentReferenceChunks(retrievalQuery, {
        topK: 10,
        assessmentId,
        questionId: "ALL",
        referenceType: "rubric",
      }).catch(() => []),
      queryAssessmentReferenceChunks(retrievalQuery, {
        topK: 6,
        assessmentId,
        questionId: "ALL",
        referenceType: "clo",
      }).catch(() => []),
    ]);

    const courseIdForMaterials =
      subDoc.courseId && typeof subDoc.courseId === "object" && subDoc.courseId._id
        ? String(subDoc.courseId._id)
        : String(subDoc.courseId || "");
    const courseMaterialChunks = courseIdForMaterials
      ? await queryCourseMaterialChunks(retrievalQuery, { topK: 8, courseId: courseIdForMaterials }).catch(() => [])
      : [];

    __dbg('automarkLlmService.js:automarkOneSubmission', 'retrieval_counts', {
      submissionId: String(subDoc?._id || ''),
      qKey,
      maxMarks,
      questionTextLen: questionText.length,
      studentChunks: Array.isArray(studentChunks) ? studentChunks.length : -1,
      sampleChunks: Array.isArray(sampleChunks) ? sampleChunks.length : -1,
      rubricChunks: ([...(rubricChunksForQ || []), ...(rubricChunksAll || [])] || []).length,
      cloChunks: Array.isArray(cloChunksAll) ? cloChunksAll.length : -1,
      courseMaterialChunks: Array.isArray(courseMaterialChunks) ? courseMaterialChunks.length : -1,
    }, 'H3');

    try {
      console.log(
        `[AUTOMARK] courseMaterials: assessment=${assessmentId} course=${courseIdForMaterials || "—"} ` +
          `submission=${String(subDoc._id)} ${qKey} chunks=${(courseMaterialChunks || []).length}`
      );
    } catch {
      // ignore
    }

    if (jobId) {
      if (Array.isArray(sampleChunks) && sampleChunks.length > 0) {
        await AutomarkJob.updateOne({ _id: jobId }, { $set: { sampleAnswerExtracted: true } }).catch(() => {});
      }
      if (Array.isArray(courseMaterialChunks) && courseMaterialChunks.length > 0) {
        await AutomarkJob.updateOne({ _id: jobId }, { $set: { relevantCourseMaterialChunksExtracted: true } }).catch(
          () => {}
        );
      }
    }

    let extractedTextForSpans = "";
    try {
      const raw = await SubmissionRaw.findOne({ submissionId: subDoc._id })
        .select("rawText")
        .lean()
        .catch(() => null);
      extractedTextForSpans = String(raw?.rawText || "");
      if (extractedTextForSpans.length > 9000) extractedTextForSpans = extractedTextForSpans.slice(0, 9000);
    } catch {
      extractedTextForSpans = "";
    }
    __dbg('automarkLlmService.js:automarkOneSubmission', 'extracted_text_len', { submissionId: String(subDoc?._id || ''), qKey, extractedTextLen: extractedTextForSpans.length }, 'H4');

    if (jobId) {
      await pushAutomarkJobLog(
        jobId,
        `${String(subDoc.studentName || subDoc.studentId || "Student")}: chunks for ${qKey} ` +
          `(student=${(studentChunks || []).length}, sample=${(sampleChunks || []).length}, ` +
          `rubric=${([...(rubricChunksForQ || []), ...(rubricChunksAll || [])] || []).length}, clo=${(cloChunksAll || []).length})`
      );
      await pushAutomarkJobLog(
        jobId,
        `${String(subDoc.studentName || subDoc.studentId || "Student")}: LLM marking ${qKey}…`
      );
    }

    const studentContext = (studentChunks || [])
      .slice(0, 8)
      .map((c, idx) => `[#${idx + 1} sim=${Number(c.similarity || 0).toFixed(3)}]\n${String(c.text || "").slice(0, 1200)}`)
      .join("\n\n");

    const referenceContext = (sampleChunks || [])
      .slice(0, 8)
      .map((c, idx) => `[#${idx + 1} sim=${Number(c.similarity || 0).toFixed(3)}]\n${String(c.text || "").slice(0, 1200)}`)
      .join("\n\n");

    const mergedRubricChunks = [...(rubricChunksForQ || []), ...(rubricChunksAll || [])];
    const rubricContext = (mergedRubricChunks || [])
      .slice(0, 8)
      .map((c, idx) => `[#${idx + 1} sim=${Number(c.similarity || 0).toFixed(3)}]\n${String(c.text || "").slice(0, 1200)}`)
      .join("\n\n");

    const cloContext = (cloChunksAll || [])
      .slice(0, 4)
      .map((c, idx) => `[#${idx + 1} sim=${Number(c.similarity || 0).toFixed(3)}]\n${String(c.text || "").slice(0, 800)}`)
      .join("\n\n");

    const courseMaterialContext = (courseMaterialChunks || [])
      .slice(0, 8)
      .map((c, idx) => `[#${idx + 1} sim=${Number(c.similarity || 0).toFixed(3)}]\n${String(c.text || "").slice(0, 1200)}`)
      .join("\n\n");

    const prompt = `You are an automated grading assistant for a ${assessment.type || "quiz"}.
Return ONLY valid JSON (no markdown, no commentary).

Task:
- Grade the student's answer for ${qKey}.
- Use the MARKING RUBRIC as the primary source of truth. If the rubric conflicts with the sample answer, follow the rubric.
- For short-answer/theory questions: grade by CONCEPT COVERAGE (paraphrase-friendly). The student may explain concepts differently than the sample answer; that's valid if the concepts are correct.
- First infer 3-8 key concepts/points from the rubric + sample answer, assign weights that sum to maxMarks, then check whether the student's answer covers each point.
- Do NOT require exact wording; accept correct synonyms and equivalent explanations.
- If the student contradicts a required concept, deduct marks even if other points are correct.
- For coding questions: follow the rubric's weighted criteria (e.g., approach/correctness/efficiency/quality) and award marks per-criterion.
- Award marks between 0 and ${maxMarks} (can be decimal).
- Be strict but fair. If evidence is missing, reduce marks.
- EVIDENCE GATE (critical to reduce false positives):
  - Only award marks for a key point/criterion if you can support it with a short quote from STUDENT SUBMISSION chunks.
  - Each covered point MUST include: (a) a chunk reference like "#3" and (b) a short excerpt quote from that chunk.
  - If you cannot find evidence in STUDENT SUBMISSION chunks, treat the point as NOT covered and award 0 for that point.
  - Do NOT use the sample answer/rubric text as student evidence.
- MISTAKE DETECTION (for UI highlights + teacher review):
  - Always output a "mistakes" array (can be empty).
  - Include mistakes such as:
    - missing_concept: student did not mention a required concept (from rubric/sample).
    - incorrect_statement: student claimed something wrong.
    - weak_explanation: vague/partial explanation where important detail is missing.
    - no_evidence: you wanted to award marks but couldn't find student evidence in the chunks.
    - grammar: clear grammar/spelling issues that reduce clarity (only when obvious).
  - For mistakes that reference something the student wrote (incorrect_statement/weak_explanation/grammar/no_evidence):
    - Provide "evidenceQuote" as an EXACT snippet from STUDENT SUBMISSION chunks.
    - Provide "suggestedCorrection" in plain English (or corrected sentence for grammar).
  - For missing_concept:
    - "evidenceQuote" may be empty (""), but "message" must clearly name the missing concept.
  - Never fabricate quotes. If you can't quote student text, keep evidenceQuote="" and use type="missing_concept" or "no_evidence" appropriately.

QUESTION (${qKey}) [type=${questionType || "unknown"}] [maxMarks=${maxMarks}]
${questionText}

CLO / LEARNING OUTCOME (RAG chunks)
${cloContext || "NO_CLO_FOUND"}

COURSE MATERIALS (RAG chunks)
${courseMaterialContext || "NO_COURSE_MATERIAL_FOUND"}

MARKING RUBRIC (RAG chunks)
${rubricContext || "NO_RUBRIC_FOUND"}

REFERENCE SAMPLE ANSWER (RAG chunks)
${referenceContext || "NO_REFERENCE_FOUND"}

STUDENT SUBMISSION (RAG chunks)
${studentContext || "NO_SUBMISSION_TEXT_FOUND"}

STUDENT EXTRACTED TEXT (for exact spanStart/spanEnd highlighting)
IMPORTANT:
- If you include start_index/end_index in mistakes, they MUST be character indices into THIS exact text block.
- start_index is inclusive, end_index is exclusive.
- The substring studentText[start_index:end_index] MUST exactly match text_span (after trimming) when start/end are provided.
${extractedTextForSpans ? extractedTextForSpans : "NO_EXTRACTED_TEXT_FOUND"}

Output JSON schema:
{
  "awardedMarks": number,
  "maxMarks": number,
  "confidence": number,
  "studentAnswerSummary": string, // 1-3 lines, summarise ONLY what the student said using the student chunks
  "summary": string,
  "strengths": string[],
  "improvements": string[],
  "evidence": string[], // each item must cite chunk reference(s) like "#2" and include a short quote excerpt
  "mistakes"?: [
    {
      "type": string, // e.g. "missing_concept" | "incorrect_statement" | "weak_explanation" | "no_evidence" | "grammar"
      "text_span": string, // exact snippet from STUDENT EXTRACTED TEXT (or \"\" for missing_concept)
      "start_index"?: number, // character index in STUDENT EXTRACTED TEXT
      "end_index"?: number,
      "feedback": string, // what is wrong + why (teacher-facing)
      "suggestion": string // corrected sentence or how to improve
    }
  ],
  "keyPoints"?: [
    { "point": string, "weight": number }
  ],
  "coverage"?: [
    {
      "point": string,
      "weight": number,
      "covered": boolean,
      "chunkRef": string, // e.g. "#3" or "" when not covered
      "evidenceQuote": string, // short quote from student chunk, or "NO_EVIDENCE_FOUND"
      "notes"?: string
    }
  ],
  "rubricBreakdown"?: [
    { "criterion": string, "awarded": number, "max": number, "notes"?: string }
  ]
}`;

    let awardedMarks = 0;
    let confidence = 0;
    let summary = "";
    let strengths = [];
    let improvements = [];
    let evidence = [];
    let studentAnswerSummary = "";
    let keyPoints = [];
    let coverage = [];
    let rubricBreakdown = [];
    let mistakes = [];
    let error = "";

    try {
      const llmStartedAt = Date.now();
      const parsed = await generateJsonWithRetries({
        prompt,
        options: { temperature: 0.2, top_p: 0.9, num_ctx: 4096 },
        maxRetries: 2,
      });
      const llmMs = Date.now() - llmStartedAt;

      awardedMarks = Number(parsed.awardedMarks ?? 0) || 0;
      const parsedMax = Number(parsed.maxMarks ?? maxMarks);
      const boundedMax = Number.isFinite(parsedMax) ? parsedMax : maxMarks;
      confidence = Math.max(0, Math.min(100, Number(parsed.confidence ?? 50) || 50));
      summary = String(parsed.summary || "").trim();
      studentAnswerSummary = String(parsed.studentAnswerSummary || "").trim();
      strengths = Array.isArray(parsed.strengths) ? parsed.strengths.map(String).filter(Boolean) : [];
      improvements = Array.isArray(parsed.improvements) ? parsed.improvements.map(String).filter(Boolean) : [];
      evidence = Array.isArray(parsed.evidence) ? parsed.evidence.map(String).filter(Boolean) : [];
      mistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes.map(normalizeMistake).filter(Boolean) : [];
      keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [];
      coverage = Array.isArray(parsed.coverage) ? parsed.coverage : [];
      rubricBreakdown = Array.isArray(parsed.rubricBreakdown) ? parsed.rubricBreakdown : [];

      const clampMax = Number.isFinite(boundedMax) ? boundedMax : maxMarks;
      awardedMarks = Math.max(0, Math.min(clampMax, awardedMarks));

      if (jobId) {
        await pushAutomarkJobLog(
          jobId,
          `${String(subDoc.studentName || subDoc.studentId || "Student")}: ${qKey} done ` +
            `(${awardedMarks}/${maxMarks}, ${llmMs}ms)`
        );
      }
      __dbg('automarkLlmService.js:automarkOneSubmission', 'parsed_result', {
        submissionId: String(subDoc?._id || ''),
        qKey,
        llmMs,
        awardedMarks,
        maxMarks,
        confidence,
        mistakesCount: Array.isArray(mistakes) ? mistakes.length : 0,
        hasFeedback: Boolean(String(summary || '').trim() || String(studentAnswerSummary || '').trim()),
      }, 'H5');
    } catch (e) {
      error = e?.message || String(e);
      awardedMarks = 0;
      confidence = 0;
      if (jobId) {
        await pushAutomarkJobLog(
          jobId,
          `${String(subDoc.studentName || subDoc.studentId || "Student")}: ${qKey} failed: ${error}`,
          "error"
        );
      }
      __dbg('automarkLlmService.js:automarkOneSubmission', 'llm_failed_for_question', { submissionId: String(subDoc?._id || ''), qKey, error: String(error || '') }, 'H2');
    }

    report.questions.push({
      questionKey: qKey,
      questionId: q?._id ? String(q._id) : null,
      questionType: questionType || null,
      questionText,
      awardedMarks,
      maxMarks,
      confidence,
      studentAnswerSummary,
      summary,
      strengths,
      improvements,
      evidence,
      keyPoints,
      coverage,
      rubricBreakdown,
      mistakes,
      retrieval: {
        studentChunksFound: Array.isArray(studentChunks) ? studentChunks.length : 0,
        sampleChunksFound: Array.isArray(sampleChunks) ? sampleChunks.length : 0,
      },
      error: error || null,
    });

    report.totals.awarded += awardedMarks;
    confidenceSum += confidence;
    confidenceCount += 1;

    // Persist progress after EACH question to avoid losing data on interruption.
    try {
      const perQuestionScoresSoFar = buildPerQuestionScoresFromReport(report);
      await SubmissionRaw.updateOne(
        { submissionId: subDoc._id },
        {
          $setOnInsert: { submissionId: subDoc._id },
          $set: {
            assessmentId: subDoc.assessmentId || assessment?._id || null,
            courseId: subDoc.courseId || null,
            teacherId: String(subDoc.teacherId || ""),
            studentId: String(subDoc.studentId || ""),
            automarkStatus: "processing",
            automarkError: "",
            automarkReport: report,
            perQuestionScores: perQuestionScoresSoFar,
            totalAwardedMarks: Number(report?.totals?.awarded ?? 0) || 0,
            automarkedAt: new Date(),
          },
        }
      ).catch(() => {});
    } catch {
      // never fail grading due to progress persistence
    }
  }

  const maxTotal = Number(report.totals.max || 0) || 0;
  if (maxTotal > 0 && report.totals.awarded > maxTotal) report.totals.awarded = maxTotal;
  const avgConfidence = confidenceCount ? Math.round(confidenceSum / confidenceCount) : null;
  report.confidence = avgConfidence;

  await Submission.updateOne(
    { _id: subDoc._id },
    {
      $set: {
        grade: report.totals.awarded,
        gradedAt: new Date(),
        aiGradingSuggestion: report.totals.awarded,
        aiConfidence: avgConfidence,
        aiAnalysis: JSON.stringify(report),
        status: "graded",
      },
    }
  );

  // Finalize SubmissionRaw after all questions (so UI sees completed + stable fields).
  try {
    const perQuestionScores = buildPerQuestionScoresFromReport(report);
    await SubmissionRaw.updateOne(
      { submissionId: subDoc._id },
      {
        $setOnInsert: { submissionId: subDoc._id },
        $set: {
          assessmentId: subDoc.assessmentId || assessment?._id || null,
          courseId: subDoc.courseId || null,
          teacherId: String(subDoc.teacherId || ""),
          studentId: String(subDoc.studentId || ""),
          automarkStatus: "completed",
          automarkError: "",
          automarkReport: report,
          perQuestionScores,
          totalAwardedMarks: Number(report?.totals?.awarded ?? 0) || 0,
          automarkedAt: new Date(),
        },
      }
    ).catch(() => {});
  } catch {
    // best-effort only
  }

  return report;
}

module.exports = {
  OLLAMA_API_URL,
  OLLAMA_MODEL,
  extractFirstJsonObject,
  generateJsonWithRetries,
  pushAutomarkJobLog,
  automarkOneSubmission,
  buildPerQuestionScoresFromReport,
};
