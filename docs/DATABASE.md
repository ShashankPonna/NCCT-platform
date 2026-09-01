# Database

Status: schema is applied to a live Supabase project (ref `qkplydvsmikcprpmtlvi`). [`supabase/migrations/`](../supabase/migrations/) is the source of truth for exact columns, types, constraints, indexes, and RLS policies — `20260901000001_init_schema.sql` (all 20 tables), `20260901000002_harden_security.sql` (fixes for two WARN-level findings the Supabase security advisor raised: the `vector` extension living in `public` instead of a dedicated schema, and the `handle_new_user` trigger function being callable directly via the PostgREST RPC surface), `20260901000003_f2_programme_nomination_rls.sql` and `20260901000004_f2_timetable_rls.sql` (RLS policies added alongside the F2 feature routes — see below), `20260901000005_f3_lms_core.sql` (read policies for `courses`/`modules`/`lessons`, plus `lessons.video_id` — see below), `20260901000006_f3_translations_interactive.sql` (`content_translations` read policy + `lessons.interactive_config`), `20260901000007_f4_assessment_certification.sql` (`assessments` read policy — see below and DECISIONS.md #15 for why `assessment_questions` deliberately does _not_ get one). This document stays the conceptual/relationship overview; update both together when the schema changes, and add a new migration rather than editing an applied one.

Single Supabase Postgres instance, shared by web and mobile through the Express API only (see [ARCHITECTURE.md](ARCHITECTURE.md)). pgvector extension used for embeddings (face recognition, chatbot RAG).

## Core Entities

**profiles** — one row per user (Admin, Trainer, Trainee, Employer), linked 1:1 to a Supabase Auth user. Holds role, name, contact, and role-specific fields (trainee: cooperative/PACS affiliation; employer: org name/sector).

**institutions** — VAMNICOM/RICM/ICM records; programmes belong to an institution.

**programmes** — a training programme: title, dates, mode, capacity, target audience, owning institution.

**nominations** — join entity between `profiles` (trainee) and `programmes`, with approval status (pending/approved/waitlisted) and enrollment date.

**timetable_sessions** — sessions within a programme (date/time/location), used by both the timetable view and attendance.

**courses / modules / lessons** — LMS content hierarchy. A `programme` may map to one or more `courses`; a `course` has `modules`; a `module` has `lessons`. A lesson's `content_type` is one of `video | pdf | slides | text | interactive`. PDF/slides content uses `storage_path` against the `lesson-content` Supabase Storage bucket (see Storage section below). Video content (SIH prototype) uses `video_id` instead — the 11-character ID of a YouTube **unlisted** video, `CHECK`-constrained to that exact format so a full URL can never be stored by mistake; see [DECISIONS.md](DECISIONS.md) #12 for why and how this swaps out later. Interactive content uses `interactive_config` (jsonb) — currently one exercise type, `matching`; see [DECISIONS.md](DECISIONS.md) #14 for why this is jsonb rather than normalized tables. A lesson only ever uses the field(s) matching its `content_type` — nothing enforces that exclusivity at the DB level yet (`TBD` if it should).

**content_translations** — per-lesson translation rows keyed by lesson ID + locale (e.g. `en`, `hi`), supporting the MVP's multi-language requirement. The _primary_-language content also lives here as a normal locale row, not inline on `lessons` — a lesson's base row only ever carries structural fields (`title` as a fallback label, `content_type`, media pointers), not the actual body text. The locale itself is validated by shape only (`^[a-z]{2}(-[A-Z]{2})?$`) — PRD §14 hasn't settled which second language ships, so the API deliberately doesn't hardcode a locale enum; `packages/constants`' `SUGGESTED_LOCALES` is only a UI convenience list, not a DB-level constraint.

**lesson_progress** — per-trainee, per-lesson progress (%, last position, completed_at). Written by both web and mobile through the same Express endpoint; this is also the table the offline-sync queue replays into.

**assessments / assessment_questions** — quiz definitions tied to a module. `assessment_questions.correct_option_id` must never reach a trainee taking the quiz — this table has no RLS read policy at all (unlike every other content table), and every read goes through Express (`supabaseAdmin`), which strips that field before responding to a trainee. See [DECISIONS.md](DECISIONS.md) #15.

**assessment_attempts** — a trainee's submitted answers + server-computed score (`score_percent`/`passed` are always computed in Express from `assessment_questions.correct_option_id`, never trusted from the client, per CLAUDE.md's security rules — verified live: a request body claiming `score_percent: 100, passed: true` alongside all-wrong answers is silently ignored and graded correctly as 0%/failed).

**certificates** — issued on a passing `assessment_attempts` row: unique `certificate_code` (format `NCCT-XXXXXXXX`, an 8-char code from a 32-character alphabet that excludes visually-ambiguous characters — `0/O/1/I` — to avoid transcription errors when read off a printed certificate), a QR code (embedded in the generated PDF, encoding a link to the public verification page) plus the row itself, PDF file reference (Storage), issuing institution, issue date. Public verification reads from this table only (`certificates_public_read` RLS policy, already public at the DB layer — Express's `GET /api/certificates/:code` just adds a lookup-by-human-code and denormalizes trainee/programme/institution names for display), with no other data exposed. `programme_id`/`issuing_institution_id` are derived server-side by walking `assessment → module → course → programme → institution`, not supplied by the caller. **Open question, not resolved by the schema**: every passing assessment currently mints its own certificate (the literal reading of PRD §6.4's "on pass," since nothing in the schema distinguishes a programme-capstone assessment from any other per-module quiz) — if a programme has multiple assessments, a trainee could accumulate one certificate per passed quiz rather than one per programme. Revisit if PRD clarifies a "final assessment" concept.

**attendance_records** — per-trainee, per-session attendance, with a `method` field (`qr` | `face`) and, for face matches, the similarity score that triggered the match.

**face_embeddings** — one (or more, for re-enrollment) embedding per trainee, stored as a `vector` (pgvector) column, plus `consent_given_at` (required before any row is written — see CLAUDE.md security rules) and which model produced it (`human` | `insightface_buffalo_l`) so a future model swap doesn't silently mix incompatible embeddings.

**jobs** — employer-posted openings: title, required skills, location, owning employer.

**job_interests** — employer shortlist / trainee-interest join entity between `profiles` (trainee) and `jobs`.

**visibility_settings** — trainee's opt-in/opt-out flag for appearing in employer search (referenced by PRD edge cases around what happens to existing shortlists on opt-out — behavior `TBD`).

**chatbot_corpus_chunks** — embedded chunks (pgvector) of course/FAQ content used for RAG retrieval by the chatbot service.

**sync_queue** _(client-local concept, not a server table)_ — the mobile app's local queue of pending writes while offline; it is not part of the server schema, listed here only so the relationship between offline mobile storage and the server tables above is clear (each queued item ultimately targets one of `lesson_progress`, `assessment_attempts`, or `attendance_records`).

## Relationships (high level)

```
institutions ──< programmes ──< nominations >── profiles (trainee)
programmes ──< timetable_sessions ──< attendance_records >── profiles
programmes ──< courses ──< modules ──< lessons ──< content_translations
profiles ──< lesson_progress >── lessons
modules ──< assessments ──< assessment_questions
profiles ──< assessment_attempts >── assessments
assessment_attempts ──< certificates
profiles ──< face_embeddings
profiles (employer) ──< jobs ──< job_interests >── profiles (trainee)
profiles ──< visibility_settings
```

## Row Level Security

RLS is enabled on every table. Only tables with an already-decided access rule have a real policy so far:

- Self-access: `profiles`, `lesson_progress`, `assessment_attempts`, `attendance_records`, `visibility_settings`.
- Public read: `certificates`, `jobs` (PRD §6.4/§6.6).
- Authenticated read: `programmes` (`programmes_read_authenticated`), `timetable_sessions` (`timetable_sessions_read_authenticated`) — any logged-in user can browse the catalog/timetable; added for F2. `courses`/`modules`/`lessons`/`content_translations` (`courses_read_authenticated`/`modules_read_authenticated`/`lessons_read_authenticated`/`content_translations_read_authenticated`) — any logged-in user can browse LMS content in any language it has a translation for; added for F3. `assessments` (`assessments_read_authenticated`) — any logged-in user can see what assessments exist for a module; added for F4. Writes to all of these go through the admin/trainer-only Express routes using the service-role client, same pattern as `nominations`.
- **No policy, deliberately** (not the same as "not built yet"): `assessment_questions` gets no read policy at all, ever, by design — see [DECISIONS.md](DECISIONS.md) #15. Every read goes through Express.
- Own-row insert/select: `nominations` (`nominations_insert_own`/`nominations_select_own` — a trainee can create and see their own nomination but not edit/decide it; status changes go through the admin-only Express route using the service-role client, per DECISIONS.md #9's explicit example).

Every other table is enabled but has no policy yet — default-deny — and gets one added alongside the feature route that needs it, not invented speculatively here. See [DECISIONS.md](DECISIONS.md) #9 for why RLS is a real second layer rather than theoretical, given Express's service-role/per-user client split.

## Storage

Two buckets, both provisioned directly via the Storage Management API (`POST /storage/v1/bucket`), not a SQL migration — Storage buckets aren't plain Postgres rows in the portable-migration sense, so there's no `supabase/migrations/*.sql` file for either; if a bucket ever needs to be recreated (e.g. a fresh project), redo it with the same API call rather than trying to derive it from a migration file. Neither bucket needs `storage.objects` RLS policies because every read/write to both goes through `supabaseAdmin` (service-role, bypasses Storage RLS same as it bypasses table RLS).

- `lesson-content` — **private** (`public: false`), 25 MB file size limit, MIME types restricted to `application/pdf`, `.pptx`, `.ppt`. See [DECISIONS.md](DECISIONS.md) #13 for the upload/read-via-signed-URL pattern. Object paths follow `{lesson_id}/{timestamp}-{original_filename}`.
- `certificates` — **public** (`public: true`), 5 MB file size limit, `application/pdf` only. Public is intentional here, not an oversight: the `certificates` table already has a fully public `certificates_public_read` RLS policy (PRD §6.4's "no-login verification"), so a certificate's own PDF file being equally public is consistent, not a bigger exposure than the DB row already is. Object paths are just `{certificate_code}.pdf`.

## Open Items

- Whether `certificates` needs a revocation/status field (PRD Open Question) — deliberately not in the initial migration.
- Whether `job_interests` rows persist after a trainee opts out via `visibility_settings` (PRD Open Question).
- Retention policy for `face_embeddings` if a trainee withdraws consent — not yet designed.
- `chatbot_corpus_chunks.embedding` is `vector(1536)` as a placeholder — the actual embedding provider/model isn't chosen yet; the column will need recreating once it is.
- `lessons` has no DB-level constraint forcing `storage_path`/`video_id` exclusivity by `content_type` (e.g. a `video` row could technically also have `storage_path` set) — left unenforced for now since the Express validation schemas already keep them separate per-request; revisit if lessons end up written from more than one path.
- Course/module/lesson write access (`courses`/`modules`/`lessons` admin routes) is `admin` or `trainer` — a judgment call made when F3 was built, not an explicit PRD statement; revisit if PRD is clarified on who authors content.
- Re-uploading a lesson's PDF/slides content overwrites `lessons.storage_path` but doesn't delete the previous Storage object — an accumulating orphan, not a correctness bug (the old file is just unreferenced, never served again). Worth a cleanup pass (delete-on-overwrite, or a periodic sweep) before this goes past prototype.
- Every passing `assessment_attempts` row currently mints its own certificate — there's no "this is the programme's capstone assessment" concept anywhere in the schema, so a trainee passing multiple per-module quizzes in one programme gets multiple certificates. This is the literal reading of PRD §6.4 ("on pass"), not a bug, but worth confirming against actual intent.
- Assessment/question write access (`admin`+`trainer`) follows the same judgment call as course/module/lesson write access above, for the same "PRD doesn't say" reason.
