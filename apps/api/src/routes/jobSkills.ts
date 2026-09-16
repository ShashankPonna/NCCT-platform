import { setSkillIdsSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const jobSkillsRouter = Router();

// Which skills a job requires (Phase-2 P1, docs/PRD.md §13.1) — additive
// alongside the existing free-text `jobs.required_skills`, not a
// replacement. Ownership ("does this employer own the job") is a
// cross-table check RLS can't express as a simple own-row rule, so this
// follows jobInterests.ts's `assertOwnsJob` pattern rather than req.supabase.
async function assertOwnsJob(jobId: string, employerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("jobs").select("employer_id").eq("id", jobId).maybeSingle();
  return data?.employer_id === employerId;
}

jobSkillsRouter.put("/jobs/:id/skills", requireAuth, requireRole("employer"), async (req, res) => {
  const parsed = setSkillIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!(await assertOwnsJob(req.params.id, req.user!.id))) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const { error: deleteError } = await supabaseAdmin.from("job_skills").delete().eq("job_id", req.params.id);
  if (deleteError) {
    res.status(400).json({ error: deleteError.message });
    return;
  }

  if (parsed.data.skill_ids.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("job_skills").insert(
      parsed.data.skill_ids.map((skillId) => ({ job_id: req.params.id, skill_id: skillId })),
    );
    if (insertError) {
      res.status(400).json({ error: insertError.message });
      return;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("job_skills")
    .select("skills(id, name, category)")
    .eq("job_id", req.params.id);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json((data ?? []).map((row) => row.skills));
});

// Public read, matching `job_skills_public_read`/`jobs_public_read` — a
// job's tagged skills are as public as the posting itself, no requireAuth.
jobSkillsRouter.get("/jobs/:id/skills", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("job_skills")
    .select("skills(id, name, category)")
    .eq("job_id", req.params.id);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json((data ?? []).map((row) => row.skills));
});
