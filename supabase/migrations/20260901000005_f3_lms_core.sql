-- F3: E-Learning/LMS Core routes need read policies on the content hierarchy
-- (courses/modules/lessons had RLS enabled since the initial migration but no
-- policy yet — see DATABASE.md "Every other table ... gets one added
-- alongside the feature route that needs it").
--
-- Also adds `lessons.video_id`: the SIH prototype hosts lesson video as
-- YouTube *unlisted* videos and stores only the 11-character video ID (never
-- the full URL) — see docs/DECISIONS.md for the swap-in-later rationale.

alter table public.lessons
  add column video_id text;

alter table public.lessons
  add constraint lessons_video_id_format
  check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$');

create policy courses_read_authenticated on public.courses
  for select
  to authenticated
  using (true);

create policy modules_read_authenticated on public.modules
  for select
  to authenticated
  using (true);

create policy lessons_read_authenticated on public.lessons
  for select
  to authenticated
  using (true);
