import { createTimetableSessionSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const timetableRouter = Router();

timetableRouter.post(
  "/programmes/:id/timetable",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const parsed = createTimetableSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("timetable_sessions")
      .insert({ ...parsed.data, programme_id: req.params.id })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
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
