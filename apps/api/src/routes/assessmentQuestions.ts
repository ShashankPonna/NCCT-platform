import { bulkCreateQuestionsSchema, createQuestionSchema, updateQuestionSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { notifyAssessmentAvailable } from "../notificationService.js";
import {
  getProgrammeIdForAssessment,
  getProgrammeIdForAssessmentQuestion,
  requireProgrammeAccess,
} from "../programmeAccess.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const assessmentQuestionsRouter = Router();

// Every route here uses supabaseAdmin exclusively — assessment_questions has
// no RLS read policy at all (see the F4 migration comment), because
// correct_option_id must never reach a trainee taking the quiz. The one
// trainee-facing read (GET /take) strips it in application code instead of
// relying on RLS, which can't filter columns. See docs/DECISIONS.md #15.

assessmentQuestionsRouter.post(
  "/assessments/:id/questions",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForAssessment(req.params.id)),
  async (req, res) => {
    const parsed = createQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    // Only the first question makes an assessment takeable, so only that
    // one announces it (docs/DECISIONS.md #65) — later additions are edits.
    const { count: existingCount, error: countError } = await supabaseAdmin
      .from("assessment_questions")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", req.params.id);
    if (countError) {
      res.status(400).json({ error: countError.message });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("assessment_questions")
      .insert({ ...parsed.data, assessment_id: req.params.id })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if ((existingCount ?? 0) === 0) void notifyAssessmentAvailable(req.params.id);
    res.status(201).json(data);
  },
);

// Bulk CSV import (docs/DECISIONS.md #57): the client parses the CSV into
// the same shape as a single question and posts the whole batch here in one
// request, rather than one round-trip per row. New rows are appended after
// whatever the assessment already has, in CSV order.
assessmentQuestionsRouter.post(
  "/assessments/:id/questions/bulk",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForAssessment(req.params.id)),
  async (req, res) => {
    const parsed = bulkCreateQuestionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { count, error: countError } = await supabaseAdmin
      .from("assessment_questions")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", req.params.id);
    if (countError) {
      res.status(400).json({ error: countError.message });
      return;
    }

    const rows = parsed.data.questions.map((q, i) => ({
      ...q,
      assessment_id: req.params.id,
      position: q.position ?? (count ?? 0) + i,
    }));

    const { data, error } = await supabaseAdmin.from("assessment_questions").insert(rows).select();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    // One "new test available" per import, never one per imported row.
    if ((count ?? 0) === 0) void notifyAssessmentAvailable(req.params.id);
    res.status(201).json(data);
  },
);

// Admin/trainer authoring view — includes correct_option_id.
assessmentQuestionsRouter.get(
  "/assessments/:id/questions",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForAssessment(req.params.id)),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("assessment_questions")
      .select("*")
      .eq("assessment_id", req.params.id)
      .order("position", { ascending: true });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);

// Trainee-facing quiz view — correct_option_id stripped before it ever
// leaves the server.
assessmentQuestionsRouter.get("/assessments/:id/take", requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("assessment_questions")
    .select("*")
    .eq("assessment_id", req.params.id)
    .order("position", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  const safeQuestions = (data ?? []).map((q) => ({
    id: q.id,
    assessment_id: q.assessment_id,
    question_text: q.question_text,
    options: q.options,
    marks: q.marks,
    position: q.position,
  }));
  res.json(safeQuestions);
});

assessmentQuestionsRouter.patch(
  "/questions/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForAssessmentQuestion(req.params.id)),
  async (req, res) => {
    const parsed = updateQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("assessment_questions")
      .update(parsed.data)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    res.json(data);
  },
);

assessmentQuestionsRouter.delete(
  "/questions/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForAssessmentQuestion(req.params.id)),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("assessment_questions")
      .delete()
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    res.status(204).send();
  },
);
