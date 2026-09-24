import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseClient.js";

// Backs the per-programme trainer scoping added in docs/DECISIONS.md #52.
// Every resolver here answers one question — "what programme does this
// resource belong to?" — by walking the fixed
// programmes > courses > modules > lessons/assessments > assessment_questions
// hierarchy (docs/DATABASE.md) up to the programme id, via a single embedded
// PostgREST select rather than N sequential round trips.

export async function isTrainerAssignedToProgramme(
  trainerId: string,
  programmeId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("programme_trainers")
    .select("trainer_id")
    .eq("programme_id", programmeId)
    .eq("trainer_id", trainerId)
    .maybeSingle();
  return data != null;
}

export async function getProgrammeIdForCourse(courseId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("courses")
    .select("programme_id")
    .eq("id", courseId)
    .maybeSingle();
  return (data as { programme_id: string } | null)?.programme_id ?? null;
}

export async function getProgrammeIdForModule(moduleId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("modules")
    .select("courses(programme_id)")
    .eq("id", moduleId)
    .maybeSingle();
  const row = data as { courses: { programme_id: string } | null } | null;
  return row?.courses?.programme_id ?? null;
}

export async function getProgrammeIdForLesson(lessonId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("lessons")
    .select("modules(courses(programme_id))")
    .eq("id", lessonId)
    .maybeSingle();
  const row = data as { modules: { courses: { programme_id: string } | null } | null } | null;
  return row?.modules?.courses?.programme_id ?? null;
}

export async function getProgrammeIdForAssessment(assessmentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("assessments")
    .select("modules(courses(programme_id))")
    .eq("id", assessmentId)
    .maybeSingle();
  const row = data as { modules: { courses: { programme_id: string } | null } | null } | null;
  return row?.modules?.courses?.programme_id ?? null;
}

export async function getProgrammeIdForAssessmentQuestion(
  questionId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("assessment_questions")
    .select("assessments(modules(courses(programme_id)))")
    .eq("id", questionId)
    .maybeSingle();
  const row = data as {
    assessments: { modules: { courses: { programme_id: string } | null } | null } | null;
  } | null;
  return row?.assessments?.modules?.courses?.programme_id ?? null;
}

export async function getProgrammeIdForSession(sessionId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("timetable_sessions")
    .select("programme_id")
    .eq("id", sessionId)
    .maybeSingle();
  return (data as { programme_id: string } | null)?.programme_id ?? null;
}

/**
 * Gates a trainer to programmes they're actually assigned to; an admin
 * always passes through untouched. Must run after `requireAuth` +
 * `requireRole("admin", "trainer")` — it trusts `req.user` is already set
 * and role-checked. `resolveProgrammeId` reads whatever id param the route
 * already has (course/module/lesson/session/etc) and walks it up to a
 * programme id using the helpers above; a 404 from a missing resource is
 * reported the same way the route's own handler would report it, so a
 * trainer probing a nonexistent id can't distinguish "doesn't exist" from
 * "not yours."
 */
export function requireProgrammeAccess(resolveProgrammeId: (req: Request) => Promise<string | null>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.user!.role === "admin") {
      next();
      return;
    }

    const programmeId = await resolveProgrammeId(req);
    if (!programmeId) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const assigned = await isTrainerAssignedToProgramme(req.user!.id, programmeId);
    if (!assigned) {
      res.status(403).json({ error: "You are not assigned to this programme" });
      return;
    }
    next();
  };
}
