import { createJobSchema, updateJobSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const jobsRouter = Router();

// Own-row writes via req.supabase (RLS `jobs_insert_own`/`_update_own`/
// `_delete_own`, docs/DECISIONS.md #9) — an employer's own posting is
// genuinely own-row, own-data, same pattern as nominations. Reads are
// public — no requireAuth at all — matching `jobs_public_read`'s existing
// "this table is public data" RLS design (same category as certificate
// verification), so `supabaseAdmin` is used for reads too (an anonymous
// caller has no `req.supabase`).

jobsRouter.post("/jobs", requireAuth, requireRole("employer"), async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await req
    .supabase!.from("jobs")
    .insert({ ...parsed.data, employer_id: req.user!.id })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

// Simple keyword/array filters — no full-text search infra, consistent with
// this repo's "minimal, not gold-plated" approach elsewhere.
jobsRouter.get("/jobs", async (req, res) => {
  let query = supabaseAdmin.from("jobs").select("*").order("created_at", { ascending: false });

  const location = req.query.location;
  if (typeof location === "string" && location.length > 0) {
    query = query.ilike("location", `%${location}%`);
  }
  const skill = req.query.skill;
  if (typeof skill === "string" && skill.length > 0) {
    query = query.contains("required_skills", [skill]);
  }

  const { data, error } = await query;
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
});

jobsRouter.get("/jobs/:id", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(data);
});

jobsRouter.patch("/jobs/:id", requireAuth, requireRole("employer"), async (req, res) => {
  const parsed = updateJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await req
    .supabase!.from("jobs")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(data);
});

jobsRouter.delete("/jobs/:id", requireAuth, requireRole("employer"), async (req, res) => {
  const { data, error } = await req
    .supabase!.from("jobs")
    .delete()
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(204).send();
});
