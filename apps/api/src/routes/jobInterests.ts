import { createJobInterestSchema, updateJobInterestStatusSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const jobInterestsRouter = Router();

const UNIQUE_VIOLATION = "23505";

// Whether an employer can write a job_interests row depends on whether they
// own the *job* the row points at — a cross-table check RLS can't express
// as a simple own-row rule, so this (and every employer-side route below)
// goes through supabaseAdmin with an explicit ownership check in Express,
// per the migration's comment and docs/DATABASE.md's RLS section.
async function assertOwnsJob(jobId: string, employerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("jobs")
    .select("employer_id")
    .eq("id", jobId)
    .maybeSingle();
  return data?.employer_id === employerId;
}

jobInterestsRouter.post(
  "/jobs/:jobId/interests",
  requireAuth,
  requireRole("employer"),
  async (req, res) => {
    const parsed = createJobInterestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    if (!(await assertOwnsJob(req.params.jobId, req.user!.id))) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // A trainee who has opted out of employer visibility shouldn't be
    // actionable through this flow either, not just absent from search
    // results — a judgment call extending PRD §6.6's visibility control to
    // the whole employer-facing surface, not only the search endpoint;
    // flagged in docs/DATABASE.md's Open Items.
    const { data: visibility } = await supabaseAdmin
      .from("visibility_settings")
      .select("visible_to_employers")
      .eq("trainee_id", parsed.data.trainee_id)
      .maybeSingle();
    if (!visibility?.visible_to_employers) {
      res.status(403).json({ error: "Trainee is not visible to employers" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("job_interests")
      .insert({ job_id: req.params.jobId, trainee_id: parsed.data.trainee_id })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        res.status(409).json({ error: "Trainee already shortlisted for this job" });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

jobInterestsRouter.get(
  "/jobs/:jobId/interests",
  requireAuth,
  requireRole("employer"),
  async (req, res) => {
    if (!(await assertOwnsJob(req.params.jobId, req.user!.id))) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("job_interests")
      .select("*, profiles(full_name)")
      .eq("job_id", req.params.jobId)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);

jobInterestsRouter.patch(
  "/jobs/:jobId/interests/:interestId",
  requireAuth,
  requireRole("employer"),
  async (req, res) => {
    const parsed = updateJobInterestStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    if (!(await assertOwnsJob(req.params.jobId, req.user!.id))) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("job_interests")
      .update({ status: parsed.data.status })
      .eq("id", req.params.interestId)
      .eq("job_id", req.params.jobId)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Interest not found" });
      return;
    }
    res.json(data);
  },
);

// A trainee's own shortlist notifications — own-row RLS
// (`job_interests_select_own`), so req.supabase suffices, no ownership
// check needed.
jobInterestsRouter.get(
  "/job-interests/mine",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await req
      .supabase!.from("job_interests")
      .select("*, jobs(title, location, employer_id)")
      .order("created_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);
