import { submitAttemptSchema } from "@ncct/validation";
import { Router } from "express";
import { issueCertificateForPassingAttempt } from "../certificateService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const assessmentAttemptsRouter = Router();

// Grading — and therefore this whole submit path — uses supabaseAdmin, not
// req.supabase: computing the score requires reading correct_option_id,
// which no RLS policy exposes to a trainee (by design, see
// assessmentQuestions.ts). trainee_id always comes from req.user, never the
// request body, so a trainee can only ever submit as themselves even though
// the insert itself bypasses RLS. See docs/DECISIONS.md #15.
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

    const { data: assessment, error: assessmentError } = await supabaseAdmin
      .from("assessments")
      .select("id, pass_threshold_percent")
      .eq("id", req.params.id)
      .maybeSingle();
    if (assessmentError) {
      res.status(400).json({ error: assessmentError.message });
      return;
    }
    if (!assessment) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }

    const { data: questions, error: questionsError } = await supabaseAdmin
      .from("assessment_questions")
      .select("id, correct_option_id")
      .eq("assessment_id", req.params.id)
      .order("position", { ascending: true });
    if (questionsError) {
      res.status(400).json({ error: questionsError.message });
      return;
    }
    if (!questions || questions.length === 0) {
      res.status(400).json({ error: "This assessment has no questions yet" });
      return;
    }

    const correctCount = questions.filter(
      (q) => parsed.data.answers[q.id] === q.correct_option_id,
    ).length;
    const scorePercent = Math.round((correctCount / questions.length) * 100);
    const passed = scorePercent >= assessment.pass_threshold_percent;

    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from("assessment_attempts")
      .insert({
        assessment_id: req.params.id,
        trainee_id: req.user!.id,
        answers: parsed.data.answers,
        score_percent: scorePercent,
        passed,
      })
      .select()
      .single();
    if (attemptError) {
      res.status(400).json({ error: attemptError.message });
      return;
    }

    if (!passed) {
      res.status(201).json({ attempt, certificate: null });
      return;
    }

    try {
      const certificate = await issueCertificateForPassingAttempt({
        attemptId: attempt.id,
        assessmentId: req.params.id,
        traineeId: req.user!.id,
      });
      res.status(201).json({ attempt, certificate });
    } catch (err) {
      // The attempt itself is already recorded and graded correctly; only
      // certificate generation failed (e.g. a Storage/PDF-rendering issue).
      // Surface that distinctly rather than making the whole submission
      // look like it failed.
      res.status(201).json({
        attempt,
        certificate: null,
        certificateError: (err as Error).message,
      });
    }
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
