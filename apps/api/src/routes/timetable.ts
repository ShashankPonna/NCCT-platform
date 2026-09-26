import { createTimetableSessionSchema } from "@ncct/validation";
import { Router } from "express";
import { generateNumericCode } from "../codeGenerator.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { notifySessionScheduled } from "../notificationService.js";
import { requireProgrammeAccess } from "../programmeAccess.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const timetableRouter = Router();

const UNIQUE_VIOLATION = "23505";

// Timetable reads embed the session's course (DECISIONS.md #76) and flatten it
// to course_title, so clients can label course sessions without a second call.
const SESSION_SELECT = "*, courses(title)";
function withCourseTitle<T extends { courses?: { title: string } | null }>(row: T) {
  const { courses, ...rest } = row;
  return { ...rest, course_title: courses?.title ?? null };
}
const CHECK_IN_CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;

// Admin+trainer, not admin-only: PRD §Role table assigns "timetable" to
// Admin, but trainers reported no way to schedule their own session slots
// (direct user request) — same admin-plus-trainer widening already made for
// F3/F4's content-authoring routes (courses/modules/lessons/assessments),
// where PRD doesn't actually say trainers can't. Programme creation and
// nomination approval, immediately below/elsewhere in this file, stay
// admin-only — PRD explicitly assigns those, unlike timetable. A trainer
// additionally has to be assigned to the programme itself (docs/DECISIONS.md
// #52) — the widening above says trainers *can* schedule sessions, not that
// any trainer can schedule one for any programme.
timetableRouter.post(
  "/programmes/:id/timetable",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => Promise.resolve(req.params.id)),
  async (req, res) => {
    const parsed = createTimetableSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    // A course-specific session must name a course from this same programme —
    // otherwise a session could claim a course its trainees aren't taking.
    let courseTitle: string | null = null;
    if (parsed.data.course_id) {
      const { data: course, error: courseError } = await supabaseAdmin
        .from("courses")
        .select("title")
        .eq("id", parsed.data.course_id)
        .eq("programme_id", req.params.id)
        .maybeSingle();
      if (courseError) {
        res.status(400).json({ error: courseError.message });
        return;
      }
      if (!course) {
        res.status(400).json({ error: "That course isn't part of this programme" });
        return;
      }
      courseTitle = course.title;
    }

    // check_in_code is the only unique column besides the primary key here,
    // so any 23505 on this insert means a code collision — regenerate and
    // retry rather than failing the whole request over it. The keyspace
    // (10^6) makes repeated collisions vanishingly unlikely at this app's
    // scale; the loop exists for correctness, not because it's expected to
    // ever run more than once.
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const { data, error } = await supabaseAdmin
        .from("timetable_sessions")
        .insert({
          ...parsed.data,
          programme_id: req.params.id,
          check_in_code: generateNumericCode(CHECK_IN_CODE_LENGTH),
        })
        .select()
        .single();

      if (!error) {
        void notifySessionScheduled({
          programmeId: req.params.id,
          sessionTitle: data.title,
          startsAt: data.starts_at,
          location: data.location,
          courseTitle,
        });
        res.status(201).json({ ...data, course_title: courseTitle });
        return;
      }
      if (error.code !== UNIQUE_VIOLATION) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    res.status(500).json({ error: "Could not generate a unique session code" });
  },
);

timetableRouter.get("/programmes/:id/timetable", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("timetable_sessions")
    .select(SESSION_SELECT)
    .eq("programme_id", req.params.id)
    .order("starts_at", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json((data ?? []).map(withCourseTitle));
});

// Resolves a session's short check_in_code to its real id/UUID — the lookup
// step behind both AttendanceManager's (faculty) and TraineeAttendance's
// (trainee manual fallback) code-entry fields, so neither has to handle a
// raw UUID by hand. Any authenticated user, same as the timetable read
// above — a code alone reveals nothing sensitive, and the actual
// attendance-record insert it feeds into is still separately RLS/FK-guarded.
timetableRouter.get("/timetable-sessions/code/:code", requireAuth, async (req, res) => {
  if (!/^\d{6}$/.test(req.params.code)) {
    res.status(400).json({ error: "Session code must be 6 digits" });
    return;
  }

  const { data, error } = await req
    .supabase!.from("timetable_sessions")
    .select(SESSION_SELECT)
    .eq("check_in_code", req.params.code)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "No session found for that code" });
    return;
  }
  res.json(withCourseTitle(data));
});
