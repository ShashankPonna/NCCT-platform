import { assignTrainerSchema } from "@ncct/validation";
import type { ProgrammeTrainerRow } from "@ncct/shared-types";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const programmeTrainersRouter = Router();

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// Admin-only assignment CRUD (docs/DECISIONS.md #52): the only place rows in
// `programme_trainers` are ever written. Every content/attendance route a
// trainer can reach checks this table via programmeAccess.ts's
// requireProgrammeAccess.
programmeTrainersRouter.post(
  "/programmes/:id/trainers",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const parsed = assignTrainerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data: trainerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", parsed.data.trainer_id)
      .maybeSingle();
    if (profileError) {
      res.status(400).json({ error: profileError.message });
      return;
    }
    if (!trainerProfile || trainerProfile.role !== "trainer") {
      res.status(400).json({ error: "trainer_id must be an existing trainer account" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("programme_trainers")
      .insert({
        programme_id: req.params.id,
        trainer_id: parsed.data.trainer_id,
        assigned_by: req.user!.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        res.status(409).json({ error: "Trainer is already assigned to this programme" });
        return;
      }
      if (error.code === FOREIGN_KEY_VIOLATION) {
        res.status(404).json({ error: "Programme not found" });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

// Admin-only directory of a programme's assigned trainers, joined against
// `profiles` for a display name — the list an AdminProgrammeManager-style
// screen renders alongside an "unassign" action per row.
programmeTrainersRouter.get(
  "/programmes/:id/trainers",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("programme_trainers")
      .select("programme_id, trainer_id, assigned_by, assigned_at, profiles(full_name)")
      .eq("programme_id", req.params.id)
      .order("assigned_at", { ascending: true });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const rows: ProgrammeTrainerRow[] = (
      (data ?? []) as unknown as {
        programme_id: string;
        trainer_id: string;
        assigned_by: string | null;
        assigned_at: string;
        profiles: { full_name: string | null } | null;
      }[]
    ).map((row) => ({
      programme_id: row.programme_id,
      trainer_id: row.trainer_id,
      assigned_by: row.assigned_by,
      assigned_at: row.assigned_at,
      full_name: row.profiles?.full_name ?? null,
    }));
    res.json(rows);
  },
);

programmeTrainersRouter.delete(
  "/programmes/:id/trainers/:trainerId",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("programme_trainers")
      .delete()
      .eq("programme_id", req.params.id)
      .eq("trainer_id", req.params.trainerId)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    res.status(204).send();
  },
);

// A trainer's own assigned programme ids — lets trainer-facing UI filter the
// existing any-authenticated-user GET /programmes catalog read down to just
// the programmes this trainer can actually author content or attendance
// for, without needing a second admin-gated endpoint.
programmeTrainersRouter.get(
  "/trainers/me/programmes",
  requireAuth,
  requireRole("trainer"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("programme_trainers")
      .select("programme_id")
      .eq("trainer_id", req.user!.id);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json((data ?? []).map((row) => row.programme_id));
  },
);
