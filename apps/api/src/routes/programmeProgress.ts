import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const programmeProgressRouter = Router();

// Own-progress aggregation for a single programme: how many of its lessons
// (across all courses/modules) the calling trainee has completed. Powers
// the trainee dashboard's "Continue Learning" progress bar, which was
// previously a hardcoded 65% — see docs/IMPLEMENTATION.md's change log.
//
// Uses req.supabase throughout, not supabaseAdmin: courses/modules/lessons
// are all authenticated-read (DECISIONS.md-established RLS), and
// lesson_progress is own-row RLS (`lesson_progress_own`), so nothing here
// needs elevated privileges — same reasoning as lessonProgress.ts.
programmeProgressRouter.get(
  "/programmes/:id/progress",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data: courses, error: coursesError } = await req
      .supabase!.from("courses")
      .select("id")
      .eq("programme_id", req.params.id);

    if (coursesError) {
      res.status(400).json({ error: coursesError.message });
      return;
    }

    const courseIds = (courses ?? []).map((c) => c.id);
    if (courseIds.length === 0) {
      res.json({ programme_id: req.params.id, total_lessons: 0, completed_lessons: 0, percent: 0 });
      return;
    }

    const { data: modules, error: modulesError } = await req
      .supabase!.from("modules")
      .select("id")
      .in("course_id", courseIds);

    if (modulesError) {
      res.status(400).json({ error: modulesError.message });
      return;
    }

    const moduleIds = (modules ?? []).map((m) => m.id);
    if (moduleIds.length === 0) {
      res.json({ programme_id: req.params.id, total_lessons: 0, completed_lessons: 0, percent: 0 });
      return;
    }

    const { data: lessons, error: lessonsError } = await req
      .supabase!.from("lessons")
      .select("id")
      .in("module_id", moduleIds);

    if (lessonsError) {
      res.status(400).json({ error: lessonsError.message });
      return;
    }

    const lessonIds = (lessons ?? []).map((l) => l.id);
    const totalLessons = lessonIds.length;
    if (totalLessons === 0) {
      res.json({ programme_id: req.params.id, total_lessons: 0, completed_lessons: 0, percent: 0 });
      return;
    }

    const { data: progressRows, error: progressError } = await req
      .supabase!.from("lesson_progress")
      .select("lesson_id")
      .eq("trainee_id", req.user!.id)
      .in("lesson_id", lessonIds)
      .not("completed_at", "is", null);

    if (progressError) {
      res.status(400).json({ error: progressError.message });
      return;
    }

    const completedLessons = (progressRows ?? []).length;
    res.json({
      programme_id: req.params.id,
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      percent: Math.round((completedLessons / totalLessons) * 100),
    });
  },
);
