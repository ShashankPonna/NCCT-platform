import {
  kioskBatchSyncSchema,
  kioskCardEnrollSchema,
  kioskTapCheckInSchema,
  setKioskSessionSchema,
} from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireKioskAuth } from "../middleware/kioskAuth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const kioskRouter = Router();

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// 1. Kiosk Attendance Tap Check-in
kioskRouter.post("/kiosk/attendance/nfc-tap", requireKioskAuth, async (req, res) => {
  const parsed = kioskTapCheckInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { card_uid, session_id, tapped_at } = parsed.data;

  const targetSessionId = session_id || req.kiosk?.current_session_id;
  if (!targetSessionId) {
    res.status(400).json({
      error: "No active session specified or configured for this kiosk device",
      code: "NO_ACTIVE_SESSION",
    });
    return;
  }

  const { data: card, error: cardError } = await supabaseAdmin
    .from("trainee_nfc_cards")
    .select("trainee_id, profiles(full_name)")
    .eq("card_uid", card_uid)
    .eq("status", "active")
    .maybeSingle();

  if (cardError) {
    res.status(400).json({ error: cardError.message });
    return;
  }
  if (!card) {
    res.status(404).json({
      error: "NFC Card UID is not enrolled to any trainee",
      code: "CARD_NOT_BOUND",
    });
    return;
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("timetable_sessions")
    .select("id, programme_id, programmes(title)")
    .eq("id", targetSessionId)
    .maybeSingle();

  if (sessionError) {
    res.status(400).json({ error: sessionError.message });
    return;
  }
  if (!session) {
    res.status(404).json({
      error: "Session not found",
      code: "SESSION_NOT_FOUND",
    });
    return;
  }

  const traineeName =
    (card.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "Trainee";

  const recordedAt = tapped_at || new Date().toISOString();
  const { data: record, error: recordError } = await supabaseAdmin
    .from("attendance_records")
    .insert({
      session_id: targetSessionId,
      trainee_id: card.trainee_id,
      method: "nfc",
      recorded_at: recordedAt,
    })
    .select()
    .single();

  if (recordError) {
    if (recordError.code === UNIQUE_VIOLATION) {
      res.status(409).json({
        status: "warning",
        code: "ALREADY_CHECKED_IN",
        message: "Attendance already marked for this session",
        data: {
          trainee_name: traineeName,
        },
      });
      return;
    }
    if (recordError.code === FOREIGN_KEY_VIOLATION) {
      res.status(404).json({ error: "Session or trainee reference not found" });
      return;
    }
    res.status(400).json({ error: recordError.message });
    return;
  }

  res.status(201).json({
    status: "success",
    code: "ATTENDANCE_RECORDED",
    message: "Attendance verified successfully",
    data: {
      record_id: record.id,
      trainee_name: traineeName,
      session_title:
        (session.programmes as unknown as { title: string | null } | null)?.title ?? "Session",
      recorded_at: record.recorded_at,
    },
  });
});

// 2. Kiosk Current Session Info
kioskRouter.get("/kiosk/session", requireKioskAuth, async (req, res) => {
  const sessionId = req.kiosk?.current_session_id;
  if (!sessionId) {
    res.json({
      kiosk_id: req.kiosk?.id,
      kiosk_name: req.kiosk?.name,
      active_session: null,
      server_time: new Date().toISOString(),
    });
    return;
  }

  const { data: session, error } = await supabaseAdmin
    .from("timetable_sessions")
    .select("id, title, start_time, end_time, programmes(title)")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({
    kiosk_id: req.kiosk?.id,
    kiosk_name: req.kiosk?.name,
    active_session: session
      ? {
          session_id: session.id,
          title: session.title,
          programme_title: (session.programmes as unknown as { title: string | null } | null)?.title,
          start_time: session.start_time,
          end_time: session.end_time,
        }
      : null,
    server_time: new Date().toISOString(),
  });
});

// 3. Batch Offline Sync
kioskRouter.post("/kiosk/attendance/sync-offline", requireKioskAuth, async (req, res) => {
  const parsed = kioskBatchSyncSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { taps } = parsed.data;
  let syncedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const tap of taps) {
    const targetSessionId = tap.session_id || req.kiosk?.current_session_id;
    if (!targetSessionId) {
      invalidCount += 1;
      continue;
    }

    const { data: card } = await supabaseAdmin
      .from("trainee_nfc_cards")
      .select("trainee_id")
      .eq("card_uid", tap.card_uid)
      .eq("status", "active")
      .maybeSingle();

    if (!card) {
      invalidCount += 1;
      continue;
    }

    const { error: insertError } = await supabaseAdmin.from("attendance_records").insert({
      session_id: targetSessionId,
      trainee_id: card.trainee_id,
      method: "nfc",
      recorded_at: tap.tapped_at,
    });

    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        duplicateCount += 1;
      } else {
        invalidCount += 1;
      }
    } else {
      syncedCount += 1;
    }
  }

  res.json({
    status: "success",
    synced_count: syncedCount,
    duplicate_count: duplicateCount,
    invalid_count: invalidCount,
    total_processed: taps.length,
  });
});

// 4. Card Enrollment / Binding
kioskRouter.post(
  "/kiosk/cards/enroll",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = kioskCardEnrollSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { card_uid, trainee_id, replace_existing, notes } = parsed.data;

    const { data: existingCard } = await supabaseAdmin
      .from("trainee_nfc_cards")
      .select("id, trainee_id")
      .eq("card_uid", card_uid)
      .eq("status", "active")
      .maybeSingle();

    if (existingCard && existingCard.trainee_id !== trainee_id) {
      res.status(409).json({
        error: "This NFC Card UID is already bound to another active trainee",
        code: "CARD_ALREADY_ASSIGNED",
      });
      return;
    }

    if (replace_existing) {
      await supabaseAdmin
        .from("trainee_nfc_cards")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("trainee_id", trainee_id)
        .eq("status", "active");
    }

    const { data: newCard, error: insertError } = await supabaseAdmin
      .from("trainee_nfc_cards")
      .insert({
        trainee_id,
        card_uid,
        status: "active",
        notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      res.status(400).json({ error: insertError.message });
      return;
    }

    res.status(201).json({
      status: "success",
      code: "CARD_BOUND",
      message: "NFC card bound to trainee successfully",
      data: newCard,
    });
  },
);

// 5. Get Trainee Active Card
kioskRouter.get("/trainees/:traineeId/nfc-card", requireAuth, async (req, res) => {
  if (req.user?.role === "trainee" && req.user.id !== req.params.traineeId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { data: card, error } = await supabaseAdmin
    .from("trainee_nfc_cards")
    .select("*")
    .eq("trainee_id", req.params.traineeId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json(card);
});

// 6. Admin Kiosk Device Management
kioskRouter.get("/kiosks", requireAuth, requireRole("admin", "trainer"), async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("kiosk_devices")
    .select("id, name, current_session_id, is_active, created_at, last_heartbeat_at")
    .order("created_at", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
});

kioskRouter.patch(
  "/kiosks/:kioskId/session",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = setKioskSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("kiosk_devices")
      .update({ current_session_id: parsed.data.session_id })
      .eq("id", req.params.kioskId)
      .select("id, name, current_session_id")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);
