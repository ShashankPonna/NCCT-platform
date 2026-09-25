import { NOTIFICATION_LIST_LIMIT } from "@ncct/constants";
import type { AppNotification } from "@ncct/shared-types";
import { Router, type Request } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const notificationsRouter = Router();

// A caller's own notifications, any role (docs/DECISIONS.md #65). Reads go
// through req.supabase so the `notifications_select_own` RLS policy is the
// real enforcement. There's no update policy, so marking read goes through
// supabaseAdmin — always filtered by req.user.id, never by anything the
// client supplies about whose row it is.

async function unreadCount(req: Request): Promise<number> {
  const { count, error } = await req
    .supabase!.from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Lightweight endpoint the bell polls — a count only, no rows.
notificationsRouter.get("/notifications/unread-count", requireAuth, async (req, res) => {
  try {
    res.json({ unread_count: await unreadCount(req) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

notificationsRouter.get("/notifications/mine", requireAuth, async (req, res) => {
  const requested = Number(req.query.limit);
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, NOTIFICATION_LIST_LIMIT)
      : NOTIFICATION_LIST_LIMIT;

  const { data, error } = await req
    .supabase!.from("notifications")
    .select("id, type, data, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  try {
    res.json({
      notifications: (data ?? []) as AppNotification[],
      unread_count: await unreadCount(req),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

notificationsRouter.post("/notifications/:id/read", requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("recipient_id", req.user!.id)
    .is("read_at", null);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  // Already-read (or someone else's — indistinguishable by design, since the
  // recipient filter matches nothing) is still a 204: idempotent, and it
  // reveals nothing about rows the caller can't see.
  res.status(204).send();
});

notificationsRouter.post("/notifications/read-all", requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", req.user!.id)
    .is("read_at", null);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(204).send();
});
