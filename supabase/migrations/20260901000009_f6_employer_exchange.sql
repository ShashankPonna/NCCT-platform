-- F6: Employer & Employment Exchange.
--
-- `jobs` already had a public-read policy from the initial migration
-- (`jobs_public_read`, PRD §6.6 — job postings are meant to be browsable,
-- same "public data" design signal as `certificates_public_read`). It had no
-- write policy: an employer's own posting is genuinely own-row, own-data —
-- Express uses `req.supabase` for writes, not `supabaseAdmin`, so these
-- policies are the real enforcement layer, per docs/DECISIONS.md #9.
--
-- `job_interests` gets one policy here: a trainee can see their own
-- shortlist entries (`GET /api/job-interests/mine`). The employer side is
-- deliberately NOT given an RLS policy — unlike a simple own-row check, "can
-- this employer write an interest row" depends on whether they own the
-- *job* the interest points at, a cross-table check. Express enforces that
-- explicitly (fetch the job via `supabaseAdmin`, compare `employer_id` to
-- `req.user.id`) rather than encoding an EXISTS-subquery policy, matching
-- how nominations' admin-decide route handles a similar cross-table rule —
-- see docs/DATABASE.md's Row Level Security section.
--
-- `visibility_settings` already has full own-row RLS (`visibility_settings_own`,
-- `for all`) from the initial migration — nothing new needed for it here.

create policy "jobs_insert_own" on public.jobs
  for insert to authenticated
  with check (auth.uid() = employer_id);

create policy "jobs_update_own" on public.jobs
  for update to authenticated
  using (auth.uid() = employer_id)
  with check (auth.uid() = employer_id);

create policy "jobs_delete_own" on public.jobs
  for delete to authenticated
  using (auth.uid() = employer_id);

create policy "job_interests_select_own" on public.job_interests
  for select to authenticated
  using (auth.uid() = trainee_id);
