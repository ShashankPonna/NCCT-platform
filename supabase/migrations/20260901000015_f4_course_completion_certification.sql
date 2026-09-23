-- Certificates now key off course completion (every lesson in the course
-- done, and every module assessment in the course passed), not a single
-- passing assessment — resolves the open question DATABASE.md's certificates
-- entry previously flagged ("every passing assessment mints its own
-- certificate"), per direct user request. See DECISIONS.md #37.
--
-- Existing rows predate this model entirely (no course_id, one row per
-- passed assessment rather than per completed course) and are deleted here
-- rather than migrated — this project is still prototype-scale with no real
-- issued credentials, confirmed by inspecting the live table before writing
-- this migration (8 rows, 3 of them already pointing at Storage objects that
-- didn't exist, i.e. broken test fixtures, not real data worth preserving).
delete from public.certificates;

alter table public.certificates
  add column course_id uuid not null references public.courses (id) on delete cascade;

-- A course with no assessments at all (pure content, lesson-only) can still
-- be completed and certified; nullable so that case doesn't force a fake FK.
-- Where a course does have assessments, the app still records the most
-- recent passing attempt here for audit purposes.
alter table public.certificates
  alter column assessment_attempt_id drop not null;

-- The whole point of the new model is idempotent single issuance per course.
create unique index certificates_trainee_course_unique on public.certificates (trainee_id, course_id);
create index certificates_course_id_idx on public.certificates (course_id);
