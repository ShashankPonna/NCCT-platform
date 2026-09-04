import { FACE_MATCH_THRESHOLD } from "@ncct/constants";
import { attendanceCheckInSchema, kioskFaceCheckInSchema } from "@ncct/validation";
import { Router } from "express";
import QRCode from "qrcode";
import { requireAuth, requireRole } from "../middleware/auth.js";
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

// A trainee's own check-in, either method — own-row insert via req.supabase
// (RLS `attendance_records_insert_own`, docs/DECISIONS.md #9), not
// supabaseAdmin. For `face`, the client only ever supplies the raw embedding
// it extracted locally (docs/DECISIONS.md #16); the match score and
// pass/fail decision are always recomputed here, never trusted from the
// client, per CLAUDE.md's security rules. A below-threshold match does not
// error and does not block the trainee — it reports `fallbackToQr: true` so
// the client can offer the QR flow instead, per PRD §11's edge case.
attendanceRouter.post("/attendance", requireAuth, requireRole("trainee"), async (req, res) => {
  const parsed = attendanceCheckInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const checkIn = parsed.data;

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
  async (req, res) => {
    const parsed = kioskFaceCheckInSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { trainee_id, embedding } = parsed.data;

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

attendanceRouter.get(
  "/timetable/:sessionId/attendance",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("attendance_records")
      .select("*, profiles(full_name)")
      .eq("session_id", req.params.sessionId)
      .order("recorded_at", { ascending: true });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
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
  async (req, res) => {
    const { data: session, error } = await supabaseAdmin
      .from("timetable_sessions")
      .select("id")
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
    res.json({ qrDataUrl, checkInUrl });
  },
);
