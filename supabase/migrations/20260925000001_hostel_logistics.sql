-- Minimal hostel/room reference data plus manual trainee assignment
-- (docs/DECISIONS.md #64 — promotes a deliberately narrow slice of what
-- PRD §6 listed as "hostel/logistics management (roadmap only)").
-- Record-keeping only: no capacity/availability checks, no booking, no
-- check-in/check-out, no hardware integration of any kind.

create table public.hostels (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.hostels enable row level security;
create index hostels_institution_id_idx on public.hostels (institution_id);

-- `type` is a text + CHECK, not a Postgres enum type — same convention as
-- nominations.status and programmes.mode.
create table public.hostel_rooms (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid not null references public.hostels (id) on delete cascade,
  room_number text not null,
  capacity integer not null default 1 check (capacity > 0),
  type text not null check (type in ('dorm', 'shared', 'single')),
  created_at timestamptz not null default now(),
  unique (hostel_id, room_number)
);

alter table public.hostel_rooms enable row level security;

-- One room per trainee per programme; re-assigning replaces it (upsert on
-- the unique pair). This is data integrity, not capacity control — any
-- number of trainees may share a room.
--
-- room_id deliberately has NO cascade: deleting a room (or a hostel, which
-- cascades to its rooms) that still has trainees assigned fails on this FK,
-- which the API reports as a 409 — the same "refuse rather than silently
-- destroy history" stance institutions take toward their programmes.
--
-- Two FKs into `profiles` (trainee_id, assigned_by): any PostgREST embed of
-- `profiles` on this table must use the `profiles!trainee_id` hint, or it
-- fails as ambiguous (the bug fixed in DECISIONS.md #62).
create table public.trainee_hostel_assignments (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid not null references public.hostel_rooms (id),
  programme_id uuid not null references public.programmes (id) on delete cascade,
  assigned_on timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null,
  notes text,
  unique (trainee_id, programme_id)
);

alter table public.trainee_hostel_assignments enable row level security;
create index trainee_hostel_assignments_room_id_idx on public.trainee_hostel_assignments (room_id);
create index trainee_hostel_assignments_programme_id_idx on public.trainee_hostel_assignments (programme_id);

-- hostels / hostel_rooms get no policy at all (default-deny), exactly like
-- `institutions`: every read and write goes through Express via
-- supabaseAdmin behind requireRole("admin").
--
-- A trainee may read only their own assignment rows — same shape as
-- programme_trainers_read_own. All writes are admin-only via supabaseAdmin.
create policy "trainee_hostel_assignments_read_own" on public.trainee_hostel_assignments
  for select using (auth.uid() = trainee_id);
