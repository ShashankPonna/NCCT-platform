-- F11 Skill-Gap Analysis: finer-grained skill acquisition (docs/DECISIONS.md
-- #45). Until now, a trainee acquired every skill tagged on the *whole*
-- programme a certificate was issued under (`programme_skills`, migration
-- 20260901000012) — all-or-nothing, with no way to hold "some but not all"
-- of a programme's skills. Since certificates now key off `course_id`
-- directly (docs/DECISIONS.md #37's course-completion rework), a course is
-- already the real unit of certification — this adds the matching
-- fine-grained tagging table so a trainee certified for one course of a
-- multi-course programme can be read as acquiring just that course's
-- skills, without touching or breaking any existing programme-level tag.
--
-- `programme_skills` is not replaced or migrated: skillGapService's
-- getAcquiredSkills unions both sources going forward, so a programme still
-- tagged broadly keeps working exactly as before, and admins/trainers can
-- choose the finer course-level tag only where it's actually worth the
-- extra precision.
create table public.course_skills (
  course_id uuid not null references public.courses (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  primary key (course_id, skill_id)
);

alter table public.course_skills enable row level security;

-- Authenticated read, matching `programme_skills_read_authenticated` exactly
-- — what skills a course grants is catalog data for any logged-in user,
-- same level as the programme it belongs to.
create policy "course_skills_read_authenticated" on public.course_skills
  for select to authenticated using (true);

-- No write policy: admin/trainer content-authoring, same as
-- courses/modules/lessons/programme_skills — goes through supabaseAdmin in
-- Express (apps/api/src/routes/skills.ts).
