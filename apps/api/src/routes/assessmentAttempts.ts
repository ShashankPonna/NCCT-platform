import type { AssessmentKind } from "@ncct/shared-types";
import { submitAttemptSchema } from "@ncct/validation";
import { Router } from "express";
import { gradeAnswers, type GradableQuestion } from "../assessmentScoring.js";
import { checkAndIssueCourseCertificateForAssessment } from "../certificateService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getProgrammeIdForAssessment, requireProgrammeAccess } from "../programmeAccess.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const assessmentAttemptsRouter = Router();

interface GradingContext {
  assessment: { id: string; kind: AssessmentKind; pass_threshold_percent: number; max_attempts: number | null };
  questions: GradableQuestion[];
}

// Loads what grading needs — including correct_option_id, which is why this
// is supabaseAdmin-only (no RLS policy exposes it, DECISIONS.md #15).
// Returns an HTTP-shaped error instead of throwing so both routes below can
// report it the same way.
async function loadGradingContext(
  assessmentId: string,
): Promise<{ ok: true; value: GradingContext } | { ok: false; status: number; error: string }> {
  const { data: assessment, error: assessmentError } = await supabaseAdmin
    .from("assessments")
    .select("id, kind, pass_threshold_percent, max_attempts")
    .eq("id", assessmentId)
    .maybeSingle();
  if (assessmentError) return { ok: false, status: 400, error: assessmentError.message };
  if (!assessment) return { ok: false, status: 404, error: "Assessment not found" };

  const { data: questions, error: questionsError } = await supabaseAdmin
    .from("assessment_questions")
    .select("id, correct_option_id, marks")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true });
  if (questionsError) return { ok: false, status: 400, error: questionsError.message };
  if (!questions || questions.length === 0) {
    return { ok: false, status: 400, error: "This assessment has no questions yet" };
  }
  return {
    ok: true,
    value: { assessment: assessment as GradingContext["assessment"], questions: questions as GradableQuestion[] },
  };
}

// Grading uses supabaseAdmin, not req.supabase: computing the score needs
// correct_option_id. trainee_id always comes from req.user, never the body,
// so a trainee can only ever submit as themselves. Marks, percent and pass
// are always computed here from the stored answer key — any client-sent
// score fields are ignored (CLAUDE.md security rules).
//
// Correct answers come back only for a practice quiz. A graded module test
// reports right/wrong per question but never the answer key, since the
// trainee may retake it (DECISIONS.md #53).
assessmentAttemptsRouter.post(
  "/assessments/:id/attempts",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const parsed = submitAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const context = await loadGradingContext(req.params.id);
    if (!context.ok) {
      res.status(context.status).json({ error: context.error });
      return;
    }
    const { assessment, questions } = context.value;

    if (assessment.max_attempts !== null) {
      const { count, error: countError } = await supabaseAdmin
        .from("assessment_attempts")
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", req.params.id)
        .eq("trainee_id", req.user!.id);
      if (countError) {
        res.status(400).json({ error: countError.message });
        return;
      }
      if ((count ?? 0) >= assessment.max_attempts) {
        res.status(409).json({
          error: `Attempt limit reached (${assessment.max_attempts} allowed)`,
          attemptLimitReached: true,
        });
        return;
      }
    }

    const graded = gradeAnswers(
      questions,
      parsed.data.answers,
      assessment.pass_threshold_percent,
      assessment.kind === "quiz",
    );

    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from("assessment_attempts")
      .insert({
        assessment_id: req.params.id,
        trainee_id: req.user!.id,
        answers: parsed.data.answers,
        score_percent: graded.score_percent,
        marks_obtained: graded.marks_obtained,
        total_marks: graded.total_marks,
        passed: graded.passed,
      })
      .select()
      .single();
    if (attemptError) {
      res.status(400).json({ error: attemptError.message });
      return;
    }

    // Only a passed module test can be the event that completes a course —
    // practice quizzes never gate certification.
    if (!graded.passed || assessment.kind !== "module_test") {
      res.status(201).json({ attempt, breakdown: graded.breakdown, certificate: null });
      return;
    }

    try {
      // `certificate` is null on a perfectly normal pass if other lessons or
      // module tests in the course are still outstanding.
      const certificate = await checkAndIssueCourseCertificateForAssessment({
        assessmentId: req.params.id,
        traineeId: req.user!.id,
      });
      res.status(201).json({ attempt, breakdown: graded.breakdown, certificate });
    } catch (err) {
      // The attempt itself is recorded and graded; only certificate
      // generation failed (e.g. Storage/PDF). Report that distinctly.
      res.status(201).json({
        attempt,
        breakdown: graded.breakdown,
        certificate: null,
        certificateError: (err as Error).message,
      });
    }
  },
);

// Staff "try this test" preview: grades exactly like a real attempt through
// the same gradeAnswers call, with the full answer key revealed, and records
// nothing — so a trainer/admin can sit their own test before trainees do.
assessmentAttemptsRouter.post(
  "/assessments/:id/preview",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForAssessment(req.params.id)),
  async (req, res) => {
    const parsed = submitAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const context = await loadGradingContext(req.params.id);
    if (!context.ok) {
      res.status(context.status).json({ error: context.error });
      return;
    }
    const { assessment, questions } = context.value;
    res.json(gradeAnswers(questions, parsed.data.answers, assessment.pass_threshold_percent, true));
  },
);

assessmentAttemptsRouter.get(
  "/assessments/:id/attempts",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await req
      .supabase!.from("assessment_attempts")
      .select("*")
      .eq("assessment_id", req.params.id)
      .order("submitted_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);
