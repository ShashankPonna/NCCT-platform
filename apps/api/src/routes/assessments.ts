import { createAssessmentSchema, updateAssessmentSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getProgrammeIdForAssessment,
  getProgrammeIdForModule,
  requireProgrammeAccess,
} from "../programmeAccess.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const assessmentsRouter = Router();

assessmentsRouter.post(
  "/modules/:id/assessments",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForModule(req.params.id)),
  async (req, res) => {
    const parsed = createAssessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("assessments")
      .insert({ ...parsed.data, module_id: req.params.id })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

// supabaseAdmin rather than req.supabase: the question_count/total_marks
// totals need assessment_questions, which has no RLS read policy at all
// (DECISIONS.md #15). Only `marks` is read from it — never question text or
// correct answers — and the assessments rows themselves are already
// readable by any authenticated user (`assessments_read_authenticated`).
assessmentsRouter.get("/modules/:id/assessments", requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("assessments")
    .select("*, assessment_questions(marks)")
    .eq("module_id", req.params.id)
    .order("created_at", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(
    ((data ?? []) as { assessment_questions: { marks: number }[] | null }[]).map(
      ({ assessment_questions, ...assessment }) => ({
        ...assessment,
        question_count: (assessment_questions ?? []).length,
        total_marks: (assessment_questions ?? []).reduce((sum, q) => sum + q.marks, 0),
      }),
    ),
  );
});

assessmentsRouter.get("/assessments/:id", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("assessments")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }
  res.json(data);
});

assessmentsRouter.patch(
  "/assessments/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForAssessment(req.params.id)),
  async (req, res) => {
    const parsed = updateAssessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("assessments")
      .update(parsed.data)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }
    res.json(data);
  },
);

assessmentsRouter.delete(
  "/assessments/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForAssessment(req.params.id)),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("assessments")
      .delete()
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }
    res.status(204).send();
  },
);
