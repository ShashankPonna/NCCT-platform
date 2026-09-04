import { createSkillSchema, setSkillIdsSchema } from "@ncct/validation";
import { Router } from "express";
import { embedJobBestEffort } from "../jobMatchingService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getSkillGap } from "../skillGapService.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const skillsRouter = Router();

// The skills taxonomy itself: admin-curated, matching the "who can author
// content" judgment call courses/modules/lessons already made. Read is
// authenticated-only (`skills_read_authenticated`, migration 20260901000012)
// so RLS via req.supabase is the real enforcement, same pattern as
// programmes/courses reads.

skillsRouter.post("/skills", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = createSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin.from("skills").insert(parsed.data).select().single();
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

skillsRouter.get("/skills", requireAuth, async (req, res) => {
  let query = req.supabase!.from("skills").select("*").order("name", { ascending: true });
  const category = req.query.category;
  if (typeof category === "string" && category.length > 0) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
});

// A job's tagged skills — public, matching `job_skills_public_read`
// (part of the same public job-board data as the job posting).
skillsRouter.get("/jobs/:jobId/skills", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("job_skills")
    .select("skill_id, skills(id, name, category)")
    .eq("job_id", req.params.jobId);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json((data ?? []).map((row) => row.skills).filter(Boolean));
});

// Replaces the job's entire tagged skill set in one call — "can this
// employer tag this job" is a cross-table ownership check RLS can't express
// as an own-row rule, same reasoning as job_interests' employer-write side
// (docs/DATABASE.md's RLS section), so this goes through supabaseAdmin with
// an explicit ownership check rather than a policy.
skillsRouter.put("/jobs/:jobId/skills", requireAuth, requireRole("employer"), async (req, res) => {
  const parsed = setSkillIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("employer_id")
    .eq("id", req.params.jobId)
    .maybeSingle();
  if (job?.employer_id !== req.user!.id) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const { error: deleteError } = await supabaseAdmin
    .from("job_skills")
    .delete()
    .eq("job_id", req.params.jobId);
  if (deleteError) {
    res.status(400).json({ error: deleteError.message });
    return;
  }

  if (parsed.data.skill_ids.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("job_skills")
      .insert(parsed.data.skill_ids.map((skill_id) => ({ job_id: req.params.jobId, skill_id })));
    if (insertError) {
      res.status(400).json({ error: insertError.message });
      return;
    }
  }

  // P3 AI Job Matching (DECISIONS.md #28): a job's tagged skills feed its
  // embedding text, so re-tagging must refresh it — same fire-and-forget,
  // never-blocks-the-response reasoning as jobs.ts's create/update routes.
  void embedJobBestEffort(req.params.jobId);
  res.status(204).send();
});

// A programme's granted skills — authenticated read, matching
// `programme_skills_read_authenticated` (same catalog-browsing level as
// programmes/courses).
skillsRouter.get("/programmes/:id/skills", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("programme_skills")
    .select("skill_id, skills(id, name, category)")
    .eq("programme_id", req.params.id);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json((data ?? []).map((row) => row.skills).filter(Boolean));
});

// Content-authoring write, same admin-or-trainer judgment call as
// courses/modules/lessons — no per-programme ownership check, matching how
// those routes work today.
skillsRouter.put(
  "/programmes/:id/skills",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = setSkillIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("programme_skills")
      .delete()
      .eq("programme_id", req.params.id);
    if (deleteError) {
      res.status(400).json({ error: deleteError.message });
      return;
    }

    if (parsed.data.skill_ids.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("programme_skills")
        .insert(parsed.data.skill_ids.map((skill_id) => ({ programme_id: req.params.id, skill_id })));
      if (insertError) {
        res.status(400).json({ error: insertError.message });
        return;
      }
    }

    res.status(204).send();
  },
);

// The gap itself: what of a specific job's required skills a trainee
// already has vs. still needs, plus an optional AI-ranked "what to learn
// first" layer over the gap (skillGapService.rankMissingSkills — degrades
// to null on any failure, never blocks the deterministic gap).
skillsRouter.get("/skill-gap/:jobId", requireAuth, requireRole("trainee"), async (req, res) => {
  try {
    const result = await getSkillGap(req.user!.id, req.params.jobId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
