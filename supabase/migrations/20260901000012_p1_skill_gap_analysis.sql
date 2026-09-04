-- P1: Skill-Gap Analysis (docs/PRD.md §13.1), promoted from Phase-2 into
-- scope per docs/DECISIONS.md #26. Adds the skills taxonomy this project
-- never had (docs/DATABASE.md's Open Items previously noted `jobs.required_skills`
-- as the only skill-shaped column: free text, no taxonomy behind it) and two
-- join tables: what a job requires, and what a programme's certificate is
-- taken to prove a trainee has acquired.
--
-- This file documents schema that was applied directly against the live
-- Supabase project (`p1_skill_gap_analysis`, 2026-09-02) without ever being
-- committed as a migration file here — a real drift between the repo and
-- the live database. Written to match the live schema exactly (confirmed
-- via `list_tables`/`pg_policies` against the live project) rather than
-- re-run, since `create table` would fail against the already-applied
-- version. Going forward this file is the source of truth; do not re-apply.
--
-- `programme_skills` is the acquisition source for the gap computation: a
-- trainee is read as having acquired every skill tagged on a programme they
-- hold an issued `certificates` row for (certificates already carry
-- `programme_id` directly, so no join through assessments/modules/courses is
-- needed). This is a judgment call, not a PRD-specified rule — the PRD gives
-- no acquisition mechanism at all — but it's the same category of
-- reasonable default as F8's "completion" proxy in analyticsService.ts.

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  created_at timestamptz not null default now()
);

alter table public.skills enable row level security;

-- Authenticated read, matching `programmes_read_authenticated`'s "any
-- logged-in user can browse the catalog" design signal — not public,
-- unlike `jobs_public_read`: the skills taxonomy itself is reference data
-- for logged-in users (trainees checking a gap, employers tagging a job,
-- admins/trainers tagging a programme), not something an anonymous visitor
-- needs (unlike certificate verification or the public job board).
create policy "skills_read_authenticated" on public.skills
  for select to authenticated using (true);

-- No write policy: skill creation is admin-only and goes through Express's
-- supabaseAdmin client (apps/api/src/routes/skills.ts), the same pattern
-- courses/modules/lessons content-authoring already uses.

create table public.job_skills (
  job_id uuid not null references public.jobs (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  primary key (job_id, skill_id)
);

alter table public.job_skills enable row level security;

-- Public read, matching `jobs_public_read`: a job's tagged skills are part
-- of the same public job-board data as the job posting itself.
create policy "job_skills_public_read" on public.job_skills
  for select using (true);

-- No write policy, deliberately: "can this employer tag this job" depends
-- on whether they own the *job* the tag points at, a cross-table check —
-- the same shape of rule `job_interests`' employer-write side already
-- leaves unenforced by RLS in favor of an explicit Express check (fetch the
-- job, compare `employer_id` to `req.user.id`), per docs/DATABASE.md's Row
-- Level Security section and docs/DECISIONS.md #9.

create table public.programme_skills (
  programme_id uuid not null references public.programmes (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  primary key (programme_id, skill_id)
);

alter table public.programme_skills enable row level security;

-- Authenticated read, matching `programmes_read_authenticated` — any
-- logged-in user can already browse the programme catalog, and what skills
-- a programme grants is part of that same catalog data.
create policy "programme_skills_read_authenticated" on public.programme_skills
  for select to authenticated using (true);

-- No write policy: admin/trainer content-authoring, same as
-- courses/modules/lessons — goes through supabaseAdmin in Express.
