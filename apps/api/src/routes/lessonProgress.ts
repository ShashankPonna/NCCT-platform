import { updateLessonProgressSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const lessonProgressRouter = Router();

// Own-row read/write only (RLS `lesson_progress_own` policy, DECISIONS.md #9)
// — no service-role client involved here, unlike the content-authoring
// routes, since a trainee only ever touches their own progress row.

lessonProgressRouter.get(
  "/lessons/:id/progress",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await req
      .supabase!.from("lesson_progress")
      .select("*")
      .eq("lesson_id", req.params.id)
      .eq("trainee_id", req.user!.id)
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);

lessonProgressRouter.patch(
  "/lessons/:id/progress",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const parsed = updateLessonProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await req
      .supabase!.from("lesson_progress")
      .upsert(
        {
          ...parsed.data,
          lesson_id: req.params.id,
          trainee_id: req.user!.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trainee_id,lesson_id" },
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);
