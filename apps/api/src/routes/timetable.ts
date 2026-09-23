import { createTimetableSessionSchema } from "@ncct/validation";
import { Router } from "express";
import { generateNumericCode } from "../codeGenerator.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const timetableRouter = Router();

const UNIQUE_VIOLATION = "23505";
const CHECK_IN_CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;

// Admin+trainer, not admin-only: PRD §Role table assigns "timetable" to
// Admin, but trainers reported no way to schedule their own session slots
// (direct user request) — same admin-plus-trainer widening already made for
// F3/F4's content-authoring routes (courses/modules/lessons/assessments),
// where PRD doesn't actually say trainers can't. Programme creation and
// nomination approval, immediately below/elsewhere in this file, stay
// admin-only — PRD explicitly assigns those, unlike timetable.
timetableRouter.post(
  "/programmes/:id/timetable",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = createTimetableSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
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
        res.status(201).json(data);
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
    .select("*")
    .eq("programme_id", req.params.id)
    .order("starts_at", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
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
    .select("*")
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
  res.json(data);
});
