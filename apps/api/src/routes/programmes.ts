import { createProgrammeSchema, updateProgrammeSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const programmesRouter = Router();

programmesRouter.post("/programmes", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = createProgrammeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("programmes")
    .insert({ ...parsed.data, created_by: req.user!.id })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

programmesRouter.get("/programmes", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("programmes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
});

programmesRouter.get("/programmes/:id", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("programmes")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Programme not found" });
    return;
  }
  res.json(data);
});

programmesRouter.patch("/programmes/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = updateProgrammeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("programmes")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Programme not found" });
    return;
  }
  res.json(data);
});

programmesRouter.delete("/programmes/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("programmes")
    .delete()
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Programme not found" });
    return;
  }
  res.status(204).send();
});
