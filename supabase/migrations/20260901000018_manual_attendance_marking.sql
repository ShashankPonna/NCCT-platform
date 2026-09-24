-- F5 Attendance: lets a trainer/admin directly mark or unmark a trainee's
-- attendance from a full class roster, like a real college ERP's faculty
-- attendance register — requested directly by the user. Until now
-- attendance_records only ever got a row from a trainee's own QR/face
-- self-check-in or the kiosk's staff-operated face check-in; there was no
-- staff "just tick the box" path at all.
--
-- `method`'s CHECK constraint (declared inline, unnamed, in
-- 20260901000001_init_schema.sql) only allowed 'qr'/'face'. Found via the
-- live project's pg_constraint, not assumed, since Postgres auto-generates
-- a name for an unnamed inline CHECK and this repo's own migration history
-- has already drifted from the live schema once before (the two empty
-- 20260901000008/20260901000013 files) — a DO block below locates whatever
-- the constraint is actually named by its definition rather than guessing
-- the auto-generated name, so this migration is safe to run regardless.
do $$
declare
  existing_constraint text;
begin
  select conname into existing_constraint
  from pg_constraint
  where conrelid = 'public.attendance_records'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%method%';

  if existing_constraint is not null then
    execute format('alter table public.attendance_records drop constraint %I', existing_constraint);
  end if;
end $$;

alter table public.attendance_records
  add constraint attendance_records_method_check
  check (method in ('qr', 'face', 'manual'));

-- Who performed a manual mark — unlike QR/face, a manual mark has no
-- independent verification signal (no scan, no embedding match), so this is
-- the only audit trail of who asserted it. Null for qr/face rows (the
-- trainee/kiosk operator is already identifiable via the existing
-- session+method+trainee_id combination for those).
alter table public.attendance_records
  add column marked_by uuid references public.profiles (id) on delete set null;

comment on column public.attendance_records.marked_by is
  'Admin/trainer who manually marked this row (method=manual only) — audit trail for staff-asserted attendance.';
