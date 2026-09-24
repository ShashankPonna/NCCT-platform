-- Full assessment flow with marks (docs/DECISIONS.md #53), per direct user
-- request: practice quizzes vs graded module tests, per-question marks, a
-- marks tally, and the obtained marks carried onto the certificate.

-- 'quiz' = practice test: unlimited learning aid, never gates a certificate,
-- reveals correct answers after submission. 'module_test' = graded module
-- assessment: counts toward the course's marks tally and must be passed for
-- the course certificate. Existing rows default to 'module_test' because
-- every existing assessment already gated certification (#37) — this keeps
-- their behavior unchanged.
alter table public.assessments
  add column kind text not null default 'module_test'
    check (kind in ('quiz', 'module_test')),
  add column description text,
  add column max_attempts integer check (max_attempts is null or max_attempts > 0);

alter table public.assessment_questions
  add column marks integer not null default 1 check (marks > 0);

-- Nullable: an attempt is always graded against the question set as it was
-- at submission time, so these are snapshots, not derived later.
alter table public.assessment_attempts
  add column marks_obtained integer check (marks_obtained is null or marks_obtained >= 0),
  add column total_marks integer check (total_marks is null or total_marks > 0);

-- Backfill: every question before this migration was implicitly worth 1
-- mark, so an existing attempt's total is its assessment's question count
-- and its marks are its percent of that. Approximate only if questions were
-- added/removed after the attempt — acceptable for prototype-era data.
update public.assessment_attempts a
set total_marks = q.question_count,
    marks_obtained = round(a.score_percent * q.question_count / 100.0)
from (
  select assessment_id, count(*)::integer as question_count
  from public.assessment_questions
  group by assessment_id
) q
where q.assessment_id = a.assessment_id
  and a.total_marks is null;

-- Final marks recorded on the certificate at issue time (sum of the best
-- attempt of every module test in the course). Null for a course with no
-- module tests — a lesson-only course has no marks to report.
alter table public.certificates
  add column marks_obtained integer,
  add column total_marks integer,
  add column score_percent integer;
