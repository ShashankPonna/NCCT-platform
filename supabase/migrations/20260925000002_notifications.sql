-- In-app notification engine (docs/DECISIONS.md #65). One row per recipient
-- per event. Push/email/SMS are deliberately not here — PRD §10 still has the
-- push provider as TBD; a future channel reads these same rows.
--
-- `data` holds the event's parameters (programme title, room number, …), not
-- rendered text: the client builds the message in whichever language the
-- viewer has selected, so one row reads correctly in both English and Hindi.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'nomination_decided', 'nomination_submitted', 'lesson_published',
    'assessment_available', 'session_scheduled', 'certificate_issued',
    'hostel_assigned', 'job_shortlisted', 'job_interest_updated', 'trainer_assigned'
  )),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);

-- Own-row read only. Inserts (fan-out) and read-marking go through Express
-- via supabaseAdmin, always scoped to req.user.id for read-marking.
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = recipient_id);
