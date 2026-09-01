import { decideNominationSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const nominationsRouter = Router();

const UNIQUE_VIOLATION = "23505";

nominationsRouter.post(
  "/programmes/:id/nominations",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await req
      .supabase!.from("nominations")
      .insert({ programme_id: req.params.id, trainee_id: req.user!.id })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        res.status(409).json({ error: "Already nominated for this programme" });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

nominationsRouter.get(
  "/programmes/:id/nominations",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("nominations")
      .select("*")
      .eq("programme_id", req.params.id)
      .order("nominated_at", { ascending: true });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);

nominationsRouter.patch(
  "/programmes/:id/nominations/:nominationId",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const parsed = decideNominationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("nominations")
      .update({ status: parsed.data.status, decided_at: new Date().toISOString() })
      .eq("id", req.params.nominationId)
      .eq("programme_id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Nomination not found" });
      return;
    }
    res.json(data);
  },
);
