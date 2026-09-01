-- F4: Assessment & Certification.
--
-- `assessments` gets the same "authenticated read" policy as courses/modules/
-- lessons — its columns (title, pass_threshold_percent) carry no secrets.
--
-- `assessment_questions` deliberately gets NO read policy here, unlike every
-- other F3/F4 content table. Its `correct_option_id` column must never reach
-- a trainee taking the quiz — RLS is row-level, not column-level, so any
-- policy that let a trainee SELECT their own module's questions would leak
-- answers. Instead every read of this table goes through Express using
-- `supabaseAdmin`, which strips `correct_option_id` before responding to a
-- trainee (see docs/DECISIONS.md #15). Table stays default-deny.
--
-- `assessment_attempts` already had a self-read policy from the initial
-- migration but no insert policy. Grading happens in Express (score must be
-- server-computed, never trusted from the client — CLAUDE.md security
-- rules), and Express already needs `supabaseAdmin` to read questions'
-- correct answers before it can grade, so the attempt insert also goes
-- through `supabaseAdmin` rather than adding a parallel RLS insert path —
-- one client for the whole submit-and-grade operation, not two.
--
-- `certificates` already has its public read policy from the initial
-- migration. No insert policy needed: certificate issuance is always
-- triggered by Express after a passing attempt, via `supabaseAdmin`.

create policy assessments_read_authenticated on public.assessments
  for select
  to authenticated
  using (true);
