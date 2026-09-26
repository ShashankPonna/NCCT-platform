-- A timetable session can now name the course it's for (docs/DECISIONS.md
-- #76). Optional: programme-wide sessions (orientation, reviews, field
-- visits) keep course_id null. When a course is deleted its sessions stay
-- on the timetable as programme-level sessions rather than disappearing.
-- The API enforces that the course belongs to the session's own programme.
alter table public.timetable_sessions
  add column course_id uuid references public.courses (id) on delete set null;

create index timetable_sessions_course_id_idx
  on public.timetable_sessions (course_id);
