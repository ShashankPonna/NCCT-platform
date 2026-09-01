-- Initial schema for the NCCT cooperative training platform.
-- Entities and relationships as described in docs/DATABASE.md. This file is
-- the source of truth for exact column types/constraints; docs/DATABASE.md
-- stays the conceptual/relationship overview and links here.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ============================================================================
-- profiles (1:1 with auth.users)
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'trainer', 'trainee', 'employer')),
  full_name text not null,
  phone text,
  cooperative_affiliation text,
  org_name text,
  org_sector text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Creates a profile row automatically when a Supabase Auth user is created.
-- Expects role/full_name to be passed as user metadata at signup; defaults to
-- the least-privileged role ('trainee') if role is omitted.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'trainee'),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- institutions / programmes / nominations / timetable
-- ============================================================================

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  location text,
  created_at timestamptz not null default now()
);

alter table public.institutions enable row level security;

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  title text not null,
  description text,
  mode text not null check (mode in ('online', 'offline', 'hybrid')),
  target_audience text,
  capacity integer,
  start_date date,
  end_date date,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.programmes enable row level security;
create index programmes_institution_id_idx on public.programmes (institution_id);

create table public.nominations (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes (id) on delete cascade,
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'waitlisted', 'rejected')),
  nominated_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (programme_id, trainee_id)
);

alter table public.nominations enable row level security;
create index nominations_trainee_id_idx on public.nominations (trainee_id);

create table public.timetable_sessions (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes (id) on delete cascade,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  created_at timestamptz not null default now()
);

alter table public.timetable_sessions enable row level security;
create index timetable_sessions_programme_id_idx on public.timetable_sessions (programme_id);

-- ============================================================================
-- LMS: courses / modules / lessons / translations / progress
-- ============================================================================

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes (id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.courses enable row level security;

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.modules enable row level security;
create index modules_course_id_idx on public.modules (course_id);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null,
  content_type text not null check (content_type in ('video', 'pdf', 'slides', 'text', 'interactive')),
  storage_path text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.lessons enable row level security;
create index lessons_module_id_idx on public.lessons (module_id);

create table public.content_translations (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  locale text not null,
  title text,
  body text,
  storage_path text,
  unique (lesson_id, locale)
);

alter table public.content_translations enable row level security;

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  last_position_seconds integer,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (trainee_id, lesson_id)
);

alter table public.lesson_progress enable row level security;

create policy "lesson_progress_own" on public.lesson_progress
  for all using (auth.uid() = trainee_id) with check (auth.uid() = trainee_id);

-- ============================================================================
-- Assessments / certification
-- ============================================================================

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null,
  pass_threshold_percent integer not null default 60,
  created_at timestamptz not null default now()
);

alter table public.assessments enable row level security;

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  question_text text not null,
  -- options: [{ "id": "a", "text": "..." }, ...]
  options jsonb not null,
  correct_option_id text not null,
  position integer not null default 0
);

alter table public.assessment_questions enable row level security;

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  -- answers: { "<question_id>": "<selected_option_id>" }
  answers jsonb not null,
  score_percent integer not null,
  passed boolean not null,
  submitted_at timestamptz not null default now()
);

alter table public.assessment_attempts enable row level security;

create policy "assessment_attempts_own" on public.assessment_attempts
  for select using (auth.uid() = trainee_id);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_code text not null unique,
  assessment_attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  programme_id uuid not null references public.programmes (id) on delete cascade,
  issuing_institution_id uuid not null references public.institutions (id),
  pdf_storage_path text not null,
  issued_at timestamptz not null default now()
  -- Revocation is an open question (see docs/PRD.md §14) — no status/revoked_at
  -- column yet; add one in a follow-up migration once that's decided.
);

alter table public.certificates enable row level security;

-- Public, no-login certificate verification (docs/PRD.md §6.4) reads this
-- table directly by certificate_code.
create policy "certificates_public_read" on public.certificates
  for select using (true);

-- ============================================================================
-- Attendance (QR + face recognition)
-- ============================================================================

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.timetable_sessions (id) on delete cascade,
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  method text not null check (method in ('qr', 'face')),
  match_score numeric,
  recorded_at timestamptz not null default now(),
  unique (session_id, trainee_id)
);

alter table public.attendance_records enable row level security;

create policy "attendance_records_own" on public.attendance_records
  for select using (auth.uid() = trainee_id);

-- face_embeddings.embedding is 512-d to match the Human / InsightFace buffalo_l
-- output size (see docs/DECISIONS.md #5). No row may be written without
-- consent_given_at, per docs/CLAUDE.md security rules (DPDP Act 2023) — this
-- is enforced in the Express service layer, not by a DB constraint, since the
-- consent flow itself isn't built yet.
create table public.face_embeddings (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  embedding vector(512) not null,
  model text not null check (model in ('human', 'insightface_buffalo_l')),
  consent_given_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.face_embeddings enable row level security;

-- ============================================================================
-- Employer exchange
-- ============================================================================

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  required_skills text[],
  location text,
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

create policy "jobs_public_read" on public.jobs
  for select using (true);

create table public.job_interests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'shortlisted' check (status in ('shortlisted', 'viewed', 'contacted')),
  created_at timestamptz not null default now(),
  unique (job_id, trainee_id)
);

alter table public.job_interests enable row level security;

create table public.visibility_settings (
  trainee_id uuid primary key references public.profiles (id) on delete cascade,
  visible_to_employers boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.visibility_settings enable row level security;

create policy "visibility_settings_own" on public.visibility_settings
  for all using (auth.uid() = trainee_id) with check (auth.uid() = trainee_id);

-- ============================================================================
-- Chatbot RAG corpus
-- ============================================================================

-- embedding dimension (1536) is a placeholder matching a common embedding
-- model size — the actual embedding provider for RAG retrieval is not yet
-- decided (see docs/PRD.md §14 / docs/ARCHITECTURE.md §10). Recreate this
-- column with the correct dimension once that's chosen.
create table public.chatbot_corpus_chunks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

alter table public.chatbot_corpus_chunks enable row level security;
