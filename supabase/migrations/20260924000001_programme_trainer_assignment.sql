-- Programme-trainer assignment (docs/DECISIONS.md #52), per direct user
-- request: "Admin can allot a particular programme to one or many trainers,
-- so only the respective faculty can manipulate content or attendance for
-- it." Until now every admin+trainer content/attendance route only checked
-- `profiles.role`, with no link at all between a specific trainer and a
-- specific programme — any trainer could edit any programme's courses or
-- mark attendance on any session. This table is the missing link; the
-- accompanying Express changes read it to scope those routes.

create table public.programme_trainers (
  programme_id uuid not null references public.programmes (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (programme_id, trainer_id)
);

alter table public.programme_trainers enable row level security;
create index programme_trainers_trainer_id_idx on public.programme_trainers (trainer_id);

-- Own-row read only, same shape as attendance_records_own/profiles_select_own
-- — a trainer can see which programmes they're assigned to. All writes
-- (assign/unassign) are admin-only and go through supabaseAdmin in
-- programmeTrainers.ts, same pattern as nominations' admin decision route,
-- so no insert/update/delete policy is needed here.
create policy "programme_trainers_read_own" on public.programme_trainers
  for select using (auth.uid() = trainer_id);
