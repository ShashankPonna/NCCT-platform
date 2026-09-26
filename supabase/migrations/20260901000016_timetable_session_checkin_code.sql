-- Sharing a raw timetable_sessions UUID between faculty (and having a
-- trainee type one in by hand as the QR-check-in fallback) was the actual
-- friction reported — see docs/DECISIONS.md for the numeric join-code
-- decision this migration backs. QR check-in itself is unchanged: the QR
-- still encodes the full UUID. check_in_code is purely a short,
-- human-shareable alias for the cases where someone has to read, write, or
-- type the identifier by hand.
alter table public.timetable_sessions
  add column check_in_code text;

-- Backfill: row_number() guarantees distinct codes within this batch (a
-- fresh column has nothing pre-existing to collide with), shuffled by
-- order by random() so codes aren't sequential/guessable from creation order.
with numbered as (
  select id, row_number() over (order by random()) - 1 as rn
  from public.timetable_sessions
  where check_in_code is null
)
update public.timetable_sessions ts
set check_in_code = lpad(numbered.rn::text, 6, '0')
from numbered
where ts.id = numbered.id;

alter table public.timetable_sessions
  alter column check_in_code set not null;

create unique index timetable_sessions_check_in_code_unique
  on public.timetable_sessions (check_in_code);
