import { FACE_MATCH_THRESHOLD } from "@ncct/constants";
import { attendanceCheckInSchema, kioskFaceCheckInSchema } from "@ncct/validation";
import { Router } from "express";
import QRCode from "qrcode";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getProgrammeIdForSession, requireProgrammeAccess } from "../programmeAccess.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const attendanceRouter = Router();

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// pgvector columns come back from PostgREST as a *string* — Postgres's own
// text representation of the vector, e.g. "[0.1,-0.2,...]" — not a parsed
// JSON array, even though it looks like one. A plain `as number[]` type
// assertion on `row.embedding` hides this at compile time but breaks at
// runtime (cosineSimilarity would index into string characters, producing
// NaN throughout); confirmed live against the real Supabase project, not
// caught by unit tests since those mock the table with real JS arrays.
function parseEmbedding(value: unknown): number[] {
  return typeof value === "string" ? JSON.parse(value) : (value as number[]);
}

/** Cosine similarity of two equal-length vectors, in [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// A trainee shouldn't be markable present for a class that hasn't started
// yet — "on time" or late is fine (there's no upper bound: a staff-driven
// manual mark or a late self-check-in must keep working for as long as the
// roster stays open), only *before* `starts_at` is rejected. Exported for
// the manual-mark route to reuse the identical rule if it ever needs to
// (it deliberately doesn't today — see that route's own comment).
export function isBeforeSessionStart(startsAt: string): boolean {
  return new Date(startsAt).getTime() > Date.now();
}

function formatSessionStart(startsAt: string): string {
  return new Date(startsAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

// A trainee's own check-in, either method — own-row insert via req.supabase
// (RLS `attendance_records_insert_own`, docs/DECISIONS.md #9), not
// supabaseAdmin. For `face`, the client only ever supplies the raw embedding
// it extracted locally (docs/DECISIONS.md #16); the match score and
// pass/fail decision are always recomputed here, never trusted from the
// client, per CLAUDE.md's security rules. A below-threshold match does not
// error and does not block the trainee — it reports `fallbackToQr: true` so
// the client can offer the QR flow instead, per PRD §11's edge case.
//
// Checked before either branch: a trainee can't register presence for a
// session that hasn't started (docs/DECISIONS.md #55) — on time or late is
// fine, only early is rejected. An offline QR scan queued before start time
// (see syncManager.ts) is unaffected: the check runs against real server
// time at actual sync/insert, not the client's queued timestamp, and the
// write-queue's existing "stop and retry the whole queue" behavior already
// handles a still-too-early replay correctly as a transient failure.
attendanceRouter.post("/attendance", requireAuth, requireRole("trainee"), async (req, res) => {
  const parsed = attendanceCheckInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const checkIn = parsed.data;

  const { data: session, error: sessionError } = await req
    .supabase!.from("timetable_sessions")
    .select("starts_at")
    .eq("id", checkIn.session_id)
    .maybeSingle();
  if (sessionError) {
    res.status(400).json({ error: sessionError.message });
    return;
  }
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (isBeforeSessionStart(session.starts_at)) {
    res.status(400).json({
      error: `Check-in isn't open yet — this session starts at ${formatSessionStart(session.starts_at)}`,
    });
    return;
  }

  if (checkIn.method === "qr") {
    const { data, error } = await req
      .supabase!.from("attendance_records")
      .insert({
        session_id: checkIn.session_id,
        trainee_id: req.user!.id,
        method: "qr",
      })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        res.status(409).json({ error: "Attendance already recorded for this session" });
        return;
      }
      if (error.code === FOREIGN_KEY_VIOLATION) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
    return;
  }

  const { data: embeddings, error: embeddingsError } = await req
    .supabase!.from("face_embeddings")
    .select("embedding")
    .eq("trainee_id", req.user!.id)
    .order("created_at", { ascending: false });

  if (embeddingsError) {
    res.status(400).json({ error: embeddingsError.message });
    return;
  }
  if (!embeddings || embeddings.length === 0) {
    res.status(400).json({
      error: "No enrolled face embedding for this account",
      fallbackToQr: true,
    });
    return;
  }

  const matchScore = Math.max(
    ...embeddings.map((row) => cosineSimilarity(checkIn.embedding, parseEmbedding(row.embedding))),
  );

  if (matchScore < FACE_MATCH_THRESHOLD) {
    res.status(200).json({ matched: false, match_score: matchScore, fallbackToQr: true });
    return;
  }

  const { data, error } = await req
    .supabase!.from("attendance_records")
    .insert({
      session_id: checkIn.session_id,
      trainee_id: req.user!.id,
      method: "face",
      match_score: matchScore,
    })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      res.status(409).json({ error: "Attendance already recorded for this session" });
      return;
    }
    if (error.code === FOREIGN_KEY_VIOLATION) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json({ matched: true, ...data });
});

// Kiosk-operated face check-in (docs/DECISIONS.md #21): an ESP32-CAM-fed
// terminal has no trainee JWT to read an identity from — a staff member (or
// a prior NFC tap, see publicProfile.ts's kiosk lookup) supplies trainee_id
// explicitly instead, the same shift the NFC kiosk route already made for
// the same reason. Everything else mirrors the trainee-facing "face" branch
// above exactly: the match score is always recomputed server-side, a
// below-threshold match doesn't block or error, just reports fallbackToQr.
attendanceRouter.post(
  "/timetable/:sessionId/kiosk-face-checkin",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForSession(req.params.sessionId)),
  async (req, res) => {
    const parsed = kioskFaceCheckInSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { trainee_id, embedding } = parsed.data;

    // Same "not before start time" rule as the trainee's own check-in above
    // — a staff-operated face capture still registers presence *now*, so
    // it's subject to the same real-time rule, not exempt from it.
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("timetable_sessions")
      .select("starts_at")
      .eq("id", req.params.sessionId)
      .maybeSingle();
    if (sessionError) {
      res.status(400).json({ error: sessionError.message });
      return;
    }
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (isBeforeSessionStart(session.starts_at)) {
      res.status(400).json({
        error: `Check-in isn't open yet — this session starts at ${formatSessionStart(session.starts_at)}`,
      });
      return;
    }

    const { data: embeddings, error: embeddingsError } = await supabaseAdmin
      .from("face_embeddings")
      .select("embedding")
      .eq("trainee_id", trainee_id)
      .order("created_at", { ascending: false });

    if (embeddingsError) {
      res.status(400).json({ error: embeddingsError.message });
      return;
    }
    if (!embeddings || embeddings.length === 0) {
      res.status(400).json({
        error: "No enrolled face embedding for this trainee",
        fallbackToQr: true,
      });
      return;
    }

    const matchScore = Math.max(
      ...embeddings.map((row) => cosineSimilarity(embedding, parseEmbedding(row.embedding))),
    );

    if (matchScore < FACE_MATCH_THRESHOLD) {
      res.status(200).json({ matched: false, match_score: matchScore, fallbackToQr: true });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("attendance_records")
      .insert({
        session_id: req.params.sessionId,
        trainee_id,
        method: "face",
        match_score: matchScore,
      })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        res.status(409).json({ error: "Attendance already recorded for this session" });
        return;
      }
      if (error.code === FOREIGN_KEY_VIOLATION) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({ matched: true, ...data });
  },
);

// Roster + QR generation are admin/trainer-only cross-trainee reads, so both
// go through supabaseAdmin, same pattern as nominations' admin routes.

// Full class roster for a session (DECISIONS.md #47) — every trainee with
// an *approved* nomination in the session's programme, joined against their
// attendance_records row for this specific session (if any). An unmarked
// trainee still appears here, with `attendance: null`, which is what a
// faculty "tick the roster" screen actually needs — a plain
// `select * from attendance_records where session_id = ...` (this route's
// predecessor, removed in the same change) only ever shows who's already
// checked in.
attendanceRouter.get(
  "/timetable/:sessionId/roster",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForSession(req.params.sessionId)),
  async (req, res) => {
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("timetable_sessions")
      .select("programme_id")
      .eq("id", req.params.sessionId)
      .maybeSingle();
    if (sessionError) {
      res.status(400).json({ error: sessionError.message });
      return;
    }
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const [{ data: nominations, error: nominationsError }, { data: records, error: recordsError }] =
      await Promise.all([
        supabaseAdmin
          .from("nominations")
          .select("trainee_id, profiles(full_name)")
          .eq("programme_id", session.programme_id)
          .eq("status", "approved"),
        supabaseAdmin.from("attendance_records").select("*").eq("session_id", req.params.sessionId),
      ]);
    if (nominationsError) {
      res.status(400).json({ error: nominationsError.message });
      return;
    }
    if (recordsError) {
      res.status(400).json({ error: recordsError.message });
      return;
    }

    const recordByTrainee = new Map((records ?? []).map((r) => [r.trainee_id, r]));
    const roster = (
      (nominations ?? []) as unknown as {
        trainee_id: string;
        profiles: { full_name: string | null } | null;
      }[]
    ).map((nom) => ({
      trainee_id: nom.trainee_id,
      full_name: nom.profiles?.full_name ?? null,
      attendance: recordByTrainee.get(nom.trainee_id) ?? null,
    }));
    res.json(roster);
  },
);

// Direct staff mark (DECISIONS.md #47) — a trainer/admin ticking a trainee
// present on the roster, like a real college ERP's attendance register. The
// same category of staff-asserted fact the kiosk face check-in above already
// trusts once role middleware gates the caller: CLAUDE.md's "never trust a
// client-reported ... attendance status" is about not trusting a
// *self-reported* claim or a recomputable verdict (a face-match score, a
// quiz score) — a manual mark has no such verdict to fake, it's staff
// directly asserting a fact, the same way nomination decisions and content
// authoring already work in this codebase.
//
// Deliberately has no "not before start time" check, unlike the two
// self/kiosk check-in routes above (docs/DECISIONS.md #55) — staff need the
// roster manageable indefinitely, including long after a slot ends (fixing
// a missed scan, backfilling a paper register), and nothing here should
// narrow that window. The early-check-in rule exists to stop a trainee
// registering their own presence ahead of time, not to constrain when staff
// can correct the record.
//
// Restricted to the session's actual roster (an approved nomination in its
// programme) rather than any trainee id — the same integrity check a real
// register enforces: you can't mark someone present who isn't enrolled.
// Idempotent: marking an already-present trainee (any method) is a no-op
// that returns the existing row rather than overwriting it, so a manual
// mark can never silently erase which method a trainee actually used.
attendanceRouter.put(
  "/timetable/:sessionId/attendance/:traineeId",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForSession(req.params.sessionId)),
  async (req, res) => {
    const { sessionId, traineeId } = req.params;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("timetable_sessions")
      .select("programme_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) {
      res.status(400).json({ error: sessionError.message });
      return;
    }
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const { data: nomination, error: nominationError } = await supabaseAdmin
      .from("nominations")
      .select("trainee_id")
      .eq("programme_id", session.programme_id)
      .eq("trainee_id", traineeId)
      .eq("status", "approved")
      .maybeSingle();
    if (nominationError) {
      res.status(400).json({ error: nominationError.message });
      return;
    }
    if (!nomination) {
      res.status(404).json({ error: "Trainee is not an approved nominee for this session's programme" });
      return;
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("attendance_records")
      .select("*")
      .eq("session_id", sessionId)
      .eq("trainee_id", traineeId)
      .maybeSingle();
    if (existingError) {
      res.status(400).json({ error: existingError.message });
      return;
    }
    if (existing) {
      res.status(200).json(existing);
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("attendance_records")
      .insert({ session_id: sessionId, trainee_id: traineeId, method: "manual", marked_by: req.user!.id })
      .select()
      .single();

    if (error) {
      // A concurrent mark between the check above and this insert — the
      // other request won the race, so fetch and return its row rather
      // than erroring on what is, from the caller's point of view, success.
      if (error.code === UNIQUE_VIOLATION) {
        const { data: winner } = await supabaseAdmin
          .from("attendance_records")
          .select("*")
          .eq("session_id", sessionId)
          .eq("trainee_id", traineeId)
          .maybeSingle();
        res.status(200).json(winner);
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

// The undo side of the same feature — removes whatever attendance row
// exists for this trainee/session, regardless of how it originally got
// there (qr/face/manual). A faculty correcting a roster needs to be able to
// un-tick a mistaken self-check-in too, not just its own manual marks.
attendanceRouter.delete(
  "/timetable/:sessionId/attendance/:traineeId",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForSession(req.params.sessionId)),
  async (req, res) => {
    const { error } = await supabaseAdmin
      .from("attendance_records")
      .delete()
      .eq("session_id", req.params.sessionId)
      .eq("trainee_id", req.params.traineeId);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(204).send();
  },
);

// QR check-in (docs/IMPLEMENTATION.md's F5 recommendation): the QR encodes a
// URL, not just a raw session id — same pattern as the certificate
// verification page's `?verify=` param and NFC's profile-URL approach
// (DECISIONS.md #6). Any phone's native camera/QR app opens the link with no
// in-app scanner code needed; `apps/web` checks for a `?checkin=` param the
// same way it already checks for `?verify=`.
attendanceRouter.get(
  "/timetable/:sessionId/qr",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForSession(req.params.sessionId)),
  async (req, res) => {
    const { data: session, error } = await supabaseAdmin
      .from("timetable_sessions")
      .select("id, check_in_code")
      .eq("id", req.params.sessionId)
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const publicWebUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";
    const checkInUrl = `${publicWebUrl}/?checkin=${session.id}`;
    const qrDataUrl = await QRCode.toDataURL(checkInUrl, { width: 300 });
    res.json({ qrDataUrl, checkInUrl, checkInCode: session.check_in_code });
  },
);
