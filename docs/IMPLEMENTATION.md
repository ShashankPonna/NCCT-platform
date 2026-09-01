# Implementation Tracker

**This is a living document.** Update it whenever a significant feature, fix, or implementation change lands — see `CLAUDE.md`'s Development Workflow. It tracks _status_, not requirements or design: for what to build see [PRD.md](PRD.md), for how see [ARCHITECTURE.md](ARCHITECTURE.md)/[DATABASE.md](DATABASE.md)/[DECISIONS.md](DECISIONS.md). Nothing here duplicates their content beyond a one-line restatement per feature.

Last updated: 2026-09-01 (F4 complete — MCQ quiz builder, server-side grading, PDF/QR certificates, public verification).

## Status legend

| Symbol | Meaning                     |
| ------ | --------------------------- |
| ✅     | COMPLETE                    |
| 🟡     | PARTIALLY COMPLETE          |
| 🔴     | NOT STARTED                 |
| 🔵     | IMPLEMENTED — NEEDS TESTING |
| 🟠     | NEEDS FIX/IMPROVEMENT       |
| ⚪     | BLOCKED                     |
| ❓     | NEEDS CLARIFICATION         |

## Master feature/status table

| ID      | Feature                            | Status | Note                                                                                         |
| ------- | ---------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| F1      | Auth & User Management             | 🟡     | Auth wired + tested (`GET /api/profile`); no other routes yet                                |
| F2      | Programme & Nomination Management  | ✅     | CRUD + nomination workflow + timetable, all tested                                           |
| F3      | E-Learning / LMS Core              | ✅     | CRUD + video + progress + PDF/slides Storage + translations + interactive lesson, all tested |
| F4      | Assessment & Certification         | ✅     | MCQ builder + server-side grading + PDF/QR certificates + public verify, all tested          |
| F5      | Attendance (QR + Face Recognition) | 🔴     | Tables only; no face-rec dependency installed                                                |
| F6      | Employer & Employment Exchange     | 🔴     | Tables only                                                                                  |
| F7      | Career Counseling Chatbot          | 🔴     | Table only; no Claude SDK dependency                                                         |
| F8      | Analytics Dashboard                | 🔴     | Nothing exists, not even a table                                                             |
| F9      | Offline Mobile App                 | 🔴     | Unmodified Expo starter                                                                      |
| F10     | NFC Profile Card                   | 🔴     | Nothing exists                                                                               |
| INFRA-1 | Monorepo scaffold                  | ✅     | Verified working                                                                             |
| INFRA-2 | Database schema (MVP entities)     | ✅     | 20 tables live; will grow with features                                                      |
| INFRA-3 | Supabase project connected         | ✅     | Live project `qkplydvsmikcprpmtlvi`                                                          |
| INFRA-4 | Auth middleware wiring             | ✅     | Wired into `GET /api/profile`, covered by tests                                              |
| INFRA-5 | Testing framework                  | 🟡     | Vitest+Supertest live for `apps/api` (129 tests); web/mobile still not started               |
| INFRA-6 | README                             | ✅     | Root `README.md` added                                                                       |
| P1–P8   | Phase-2 features                   | 🔴     | See Phase-2 table below — deliberately out of MVP                                            |

No feature is currently ⚪ BLOCKED. Real open TBDs exist (embedding provider for F7, exact 2nd language for F3, cert revocation for F4) but none stop initial work — they're noted per-feature under Dependencies.

---

## F1 — Auth & User Management

**Description**: Role-based accounts (Admin, Trainer, Trainee, Employer) with institution/employer org profiles and bulk trainee import.
**Requirements**: PRD §6.1.
**Acceptance criteria** (from PRD §5 user stories, implicit across all role-gated stories): a user can be created with one of the 4 roles; an authenticated request can be identified and role-checked server-side; institution and employer org profile fields are captured; admin can bulk-import trainees.
**Status**: 🟡 PARTIALLY COMPLETE
**Relevant files**: `supabase/migrations/20260901000001_init_schema.sql` (`profiles` table, `handle_new_user` trigger), `apps/api/src/middleware/auth.ts` (`requireAuth`, `requireRole`), `apps/api/src/supabaseClient.ts` (`supabaseAdmin`, `getSupabaseForUser`), `apps/api/src/routes/profile.ts` (`GET /api/profile`), `apps/api/src/routes/profile.test.ts`, `apps/api/src/app.ts`.
**Working**: `profiles` table with role enum + role-specific fields; signup trigger auto-creates a profile from Supabase Auth signup metadata (defaults to `trainee`); `requireAuth`/`requireRole` are wired into a real route (`GET /api/profile`, returns the caller's `id`/`role`) and covered by 3 passing tests (missing token → 401, invalid token → 401, valid token → 200 with profile) plus a live boot-test against a real (placeholder-credentialed) server confirming the 401 path end-to-end.
**Missing**: no profile-update route; no institution CRUD; no employer org profile route; no bulk trainee import endpoint.
**Needs testing**: nothing untested — `requireRole` is now exercised extensively by F2's and F3's role-restricted routes (programmes/nominations/timetable/courses/modules/lessons), not just `requireAuth`.
**Known issues**: none identified.
**Dependencies**: none blocking.

## F2 — Programme & Nomination Management

**Description**: Programme CRUD, nomination/enrollment with approval workflow, per-programme timetable.
**Requirements**: PRD §6.2 ("programme CRUD; nomination/enrollment with approval workflow; timetable per programme").
**Acceptance criteria**: Admin can create a programme; a trainee can be nominated with pending/approved/waitlisted/rejected status; a programme has timetable sessions.
**Status**: ✅ COMPLETE (all three PRD §6.2 clauses implemented and tested — see ❓ note below on one edge case)
**Relevant files**: `supabase/migrations/20260901000001_init_schema.sql` (`institutions`, `programmes`, `nominations`, `timetable_sessions` tables), `20260901000003_f2_programme_nomination_rls.sql`, `20260901000004_f2_timetable_rls.sql` (RLS policies), `apps/api/src/routes/{programmes,nominations,timetable}.ts` + matching `.test.ts` files, `packages/constants/src/index.ts` (`PROGRAMME_MODES`, `NOMINATION_STATUSES`, `NOMINATION_DECISIONS`), `packages/shared-types/src/index.ts` (`Programme`, `Nomination`, `TimetableSession`), `packages/validation/src/index.ts` (`createProgrammeSchema`, `updateProgrammeSchema`, `decideNominationSchema`, `createTimetableSessionSchema`).
**Working**: full programme CRUD (admin-only writes, any-authenticated-user reads via `req.supabase` + `programmes_read_authenticated`); trainee self-nomination (`req.supabase`, own-row insert, 409 on duplicate) and admin review (list + decide → approved/waitlisted/rejected, `supabaseAdmin`); timetable sessions (admin-only create with a `starts_at < ends_at` validation, any-authenticated-user list). 30 passing tests across 4 route files (auth/role/validation/success/404/409 paths). Verified live (boot-test) that all three routers correctly 401 unauthenticated requests.
**Missing**: no web/mobile UI (expected — no UI work has started for any feature yet).
**Needs testing**: nothing untested in what's built.
**Known issues**: none identified.
**Dependencies**: F1 (uses `requireAuth`/`requireRole` — satisfied).
**❓ Needs clarification**: PRD's persona/flow text elsewhere mentions "institutions/trainees to enroll," which could imply an institution nominating a batch of trainees on their behalf, distinct from the trainee self-nomination built here. The `nominations` table (as designed) has no `institution_id` column, so this isn't just an unbuilt route — it's schema-shaped ambiguity about whether it's a real MVP requirement or an overreach in an earlier draft of this tracker's own acceptance criteria. Not treated as a blocking gap since PRD §6.2's literal three-clause definition is fully met; flagged here rather than silently assumed either way.

## F3 — E-Learning / LMS Core

**Description**: Course → module → lesson content hierarchy, progress tracking, ≥2-language content, one genuinely interactive element.
**Requirements**: PRD §6.3.
**Acceptance criteria**: lessons attach to modules attach to courses attach to programmes; a trainee's per-lesson progress is tracked; content exists in at least 2 languages; at least one lesson is interactive (not just video/quiz).
**Status**: ✅ COMPLETE (all four PRD §6.3 clauses implemented and tested — see ❓ note below on one edge case)
**Relevant files**: `supabase/migrations/20260901000001_init_schema.sql` (`courses`, `modules`, `lessons`, `content_translations`, `lesson_progress` tables — `lesson_progress_own` RLS policy already there), `20260901000005_f3_lms_core.sql` (`lessons.video_id` + read RLS for `courses`/`modules`/`lessons`), `20260901000006_f3_translations_interactive.sql` (`content_translations` read policy + `lessons.interactive_config`), the `lesson-content` Storage bucket (provisioned via the Storage Management API, not a SQL migration — see `DATABASE.md`'s Storage section), `apps/api/src/routes/{courses,modules,lessons,lessonProgress,lessonContent,contentTranslations}.ts` + matching `.test.ts` files, `packages/constants/src/index.ts` (`CONTENT_TYPES`, `YOUTUBE_VIDEO_ID_PATTERN`, `LESSON_FILE_MIME_TYPES`, `LESSON_FILE_MAX_BYTES`, `LOCALE_PATTERN`, `SUGGESTED_LOCALES`, `INTERACTIVE_EXERCISE_TYPES`), `packages/shared-types/src/index.ts` (`Course`, `Module`, `Lesson`, `ContentType`, `LessonProgress`, `ContentTranslation`, `InteractiveConfig`/`MatchingExerciseConfig`), `packages/validation/src/index.ts` (course/module/lesson schemas, `updateLessonProgressSchema`, `localeSchema`, `upsertContentTranslationSchema`, `interactiveConfigSchema`/`matchingExerciseConfigSchema`), `packages/api-client/src/index.ts` (course/module/lesson/progress/content/translation fetch wrappers), `apps/web/src/{App,LoginForm,useSession,supabaseClient,AdminCourseManager,StudentLessonView,YouTubeVideoPlayer,MatchingExercise}.tsx` (first real web UI in the repo — login + a minimal admin content editor + a minimal student lesson viewer with language switching and an interactive exercise).
**Working**: full course/module/lesson CRUD (admin+trainer writes via `supabaseAdmin`, any-authenticated-user reads via `req.supabase` + RLS); lesson video via YouTube (`video_id`, `CHECK`-constrained, embedded via `YouTubeVideoPlayer`); lesson progress (own-row upsert, trainee-reported "Mark complete", deliberately not real playback tracking); PDF/slides lessons upload through Express to a **private** Storage bucket, read back via a 60-second signed URL (DECISIONS.md #13); **and for this round** — ≥2-language content: `GET/PUT/DELETE /api/lessons/:id/translations[/:locale]`, any authenticated user reads, admin/trainer writes, locale validated by shape only (not a hardcoded enum, since PRD §14's "which 2nd language" is still open — `packages/constants`' `SUGGESTED_LOCALES` is a UI convenience list only, not a DB constraint), a translation needs at least one of title/body/storage_path (an all-empty row is rejected as a data-entry mistake); `StudentLessonView` gets a language switcher that swaps in the selected locale's title/body when present; one interactive lesson type — `matching` (term↔definition pairs), stored as jsonb (`lessons.interactive_config`, DECISIONS.md #14) validated by a discriminated-union zod schema (`≥2` pairs required), rendered as `MatchingExercise` — a tap-a-term-then-tap-its-match exercise with client-side scoring (no server round-trip needed, there's no "submission" concept for a practice exercise, unlike a graded quiz). 94 total API tests passing (12 new: 9 for translations, 3 for interactive-lesson validation). Verified live end-to-end against the real Supabase project across this and the prior three rounds (not just mocks): real admin/trainee test users, a real programme→course→module→lesson chain through the running API, video_id/PDF-upload/progress role-gating and upsert-semantics all confirmed live, **plus for this round**: added a real Hindi translation through the API and confirmed the UTF-8 round-trips correctly end-to-end (verified via a file-based payload after discovering the terminal/shell-argv path mangled non-ASCII — a test-harness artifact, not an app bug, confirmed by comparing the actual response bytes), confirmed trainee-read/admin-write role gating and malformed-locale rejection on translations, created a real interactive matching lesson through the API and confirmed a too-few-pairs config is rejected (400) while a valid one round-trips correctly. `pnpm --filter web build` succeeds.
**Missing**: nothing from PRD §6.3's stated requirements. Known scope limits (not gaps): only one interactive exercise type exists (`matching` — PRD only requires "at least one genuinely interactive element," not a library of exercise types); the admin/student web UI is intentionally bare-bones (raw programme-ID text input, no course/programme browsing UI) since F2 (programmes) has no web UI yet to link against; progress is trainee-reported only, not automatic playback tracking; uploading a new file for a lesson that already has one leaves the old Storage object orphaned (tracked in `DATABASE.md`'s Open Items, not fixed — cheap cleanup, not urgent for a prototype).
**Needs testing**: nothing untested in what's built; `apps/web` has no test framework yet (INFRA-5 still 🟡) so the new components are only verified via `tsc -b && vite build` + a manual dev-server boot + live manual API exercising, not automated component tests.
**Known issues**: none identified. Two un-enforced assumptions remain noted in `DATABASE.md`'s Open Items (no constraint preventing a lesson from having more than one of `storage_path`/`video_id`/`interactive_config` set; the orphaned-Storage-object-on-re-upload gap).
**Dependencies**: F2 (lessons hang off programmes/courses — programme CRUD exists, but F2 has no web UI, which is why the admin/student pages ask for a raw programme UUID instead of a picker).
**❓ Needs clarification**: who can author course/module/lesson content (including translations) — PRD doesn't say explicitly. Built as `admin`+`trainer` throughout (a judgment call, also noted in `DATABASE.md`); revisit if PRD is clarified.

## F4 — Assessment & Certification

**Description**: MCQ quiz builder with server-side auto-grading; auto-generated PDF certificate with unique ID/QR; public no-login certificate verification page.
**Requirements**: PRD §6.4.
**Acceptance criteria**: a trainee's quiz submission is graded server-side (never trust a client-reported score, per `CLAUDE.md` security rules); passing generates a certificate with a unique code and a PDF; anyone can verify a certificate via its code with no login.
**Status**: ✅ COMPLETE (all four PRD §6.4 clauses implemented and tested — see the certificate-per-assessment note under Dependencies)
**Relevant files**: `supabase/migrations/20260901000001_init_schema.sql` (`assessments`, `assessment_questions`, `assessment_attempts`, `certificates` tables — `certificates_public_read` RLS policy already there), `20260901000007_f4_assessment_certification.sql` (`assessments_read_authenticated`; `assessment_questions` deliberately gets no policy, see DECISIONS.md #15), the `certificates` Storage bucket (public, provisioned via the Storage Management API — see DATABASE.md's Storage section), `apps/api/src/routes/{assessments,assessmentQuestions,assessmentAttempts,certificates}.ts` + matching `.test.ts` files, `apps/api/src/certificateService.ts` + `.test.ts` (PDF/QR generation and the certificate-issuance chain, kept out of the route file since it's substantial and independently testable), `packages/shared-types/src/index.ts` (`Assessment`, `AssessmentQuestion`, `AssessmentQuestionForTrainee`, `AssessmentAttempt`, `Certificate`, `QuestionOption`), `packages/validation/src/index.ts` (`create/updateAssessmentSchema`, `create/updateQuestionSchema`, `submitAttemptSchema`), `packages/api-client/src/index.ts` (assessment/question/attempt/certificate fetch wrappers, including the one public no-token `getCertificate`), `apps/web/src/{AssessmentBuilder,QuizTaker,CertificateVerification}.tsx` (admin quiz builder, trainee quiz-taker, and the public verification page respectively).
**Working**: MCQ quiz builder — `assessments` CRUD (admin+trainer writes, any-authenticated reads) and `assessment_questions` CRUD, with a hard architectural split from every other content table: `assessment_questions` has no RLS read policy at all, ever, and every read goes through Express (`supabaseAdmin`), which strips `correct_option_id` for the trainee-facing `GET /assessments/:id/take` route but includes it for the admin/trainer authoring route (DECISIONS.md #15 — RLS can't filter columns, only rows). Server-side auto-grading: `POST /assessments/:id/attempts` reads the correct answers via `supabaseAdmin`, computes `score_percent`/`passed` itself, and ignores any client-supplied score/passed fields entirely — verified live by sending a request claiming a perfect passing score alongside all-wrong answers, which was silently ignored and graded 0%/failed. On a pass, `certificateService.issueCertificateForPassingAttempt` derives the owning programme/institution by walking `assessment → module → course → programme → institution`, generates an `NCCT-XXXXXXXX` certificate code (an ambiguity-avoiding 32-character alphabet, no `0/O/1/I`), renders a real PDF (`pdfkit`) with an embedded QR code (`qrcode`) linking to the public verification page, uploads it to a public `certificates` Storage bucket, and inserts the certificate row — all new dependencies for this codebase, isolated in `certificateService.ts` rather than inline in the route so the multi-table lookup chain and PDF rendering are unit-testable independently of the HTTP layer. `GET /api/certificates/:code` is the one route in the entire API with no `requireAuth` at all (deliberately — PRD §6.4 requires no-login verification), and denormalizes trainee/programme/institution names via a PostgREST embed so the verification page shows something more useful than raw UUIDs. Web: `AssessmentBuilder` (admin, under the selected module) creates assessments and up-to-4-option MCQ questions with a marked correct answer; `QuizTaker` (trainee, same location) lists assessments, renders the trainee-safe question set, submits answers, and shows the score/pass state plus a link to the certificate if one was issued; `CertificateVerification` is checked for and rendered by `App.tsx` **before** its login gate whenever the URL has a `?verify=` param, so it never depends on or waits for a Supabase session. 129 total API tests passing (35 new: 8 assessments, 12 questions — including the correct_option_id-stripping assertion, 10 attempts — including the client-score-spoofing-is-ignored case, 3 certificates route, 2 certificateService covering the full derivation chain and a Storage-failure path). Verified live end-to-end against the real Supabase project (not mocks): created a real assessment with 2 real MCQ questions, confirmed `GET /take` genuinely omits `correct_option_id` while the admin view includes it, submitted a 100%-correct attempt and got back a real certificate with a real ~4.5KB PDF (confirmed by downloading it and checking the `%PDF` header), confirmed the certificate object is fetchable **without a signature** at its public Storage URL (unlike lesson-content's private bucket) while an all-wrong attempt correctly scores 0%/fails and issues no certificate, confirmed the score-spoofing attempt is ignored, confirmed an admin gets 403 trying to submit an attempt, and confirmed the public `GET /api/certificates/:code` returns 200 with denormalized names for a real code and 404 for an unknown one. `pnpm --filter web build` succeeds.
**Missing**: nothing from PRD §6.4's stated requirements. `AssessmentBuilder`/`QuizTaker` are as bare-bones as the rest of this repo's admin/student UI (no question editing/reordering/deletion UI, no attempt-history view beyond what the API already returns); no automated `apps/web` component tests (INFRA-5 still 🟡, same gap as every other web component so far).
**Needs testing**: nothing untested in what's built.
**Known issues**: none identified.
**Dependencies**: F3 (assessments hang off modules — satisfied); certificate revocation is an open PRD question (§14) — deliberately not in the schema, doesn't block issuance/verification. **Genuine open item, not silently resolved**: every passing assessment currently mints its own certificate (no "capstone assessment" concept exists in the schema or PRD), so a trainee could accumulate multiple certificates within one programme if it has multiple module quizzes — flagged in `DATABASE.md`'s Open Items rather than guessed at either way.
**❓ Needs clarification**: same as F3 — who can author assessments/questions (built as `admin`+`trainer`, PRD doesn't say). Also: whether one certificate per passing assessment is the intended model, or whether only a designated "final" assessment should certify (see Dependencies above).

## F5 — Attendance (QR + Face Recognition)

**Description**: QR-code session check-in; face-recognition check-in with recorded consent, falling back to QR on match failure.
**Requirements**: PRD §6.5.
**Acceptance criteria**: attendance is logged per trainee per session with a `method` of `qr` or `face`; a face-match below threshold falls back to QR rather than blocking the trainee (PRD §11 edge case); no face embedding is stored without `consent_given_at`.
**Status**: 🔴 NOT STARTED
**Relevant files**: `supabase/migrations/20260901000001_init_schema.sql` (`attendance_records`, `face_embeddings` tables).
**Working**: schema supports both methods, the match-score column, and the consent timestamp (not-null) on `face_embeddings`.
**Missing**: QR generation/scan route, face-detection/embedding extraction (no `@vladmandic/human` or `onnxruntime-node` dependency installed in any `package.json` yet — DECISIONS.md #5 names Human as the default choice but it hasn't been added), the consent-capture flow, the fallback logic.
**Needs testing**: n/a.
**Known issues**: none.
**Dependencies**: F1 (consent capture needs an authenticated trainee); F2 (sessions come from `timetable_sessions` — now built, so satisfiable); face-rec library not yet installed — not blocked, just not started.

## F6 — Employer & Employment Exchange

**Description**: Employer job postings; trainee search/filter by skill/certification/location; trainee opt-in visibility; shortlist/interest flow.
**Requirements**: PRD §6.6.
**Acceptance criteria**: an employer can post a job; a trainee only appears in search if `visibility_settings.visible_to_employers` is true; an employer can shortlist a trainee.
**Status**: 🔴 NOT STARTED
**Relevant files**: `supabase/migrations/20260901000001_init_schema.sql` (`jobs`, `job_interests`, `visibility_settings` tables — `jobs_public_read` and `visibility_settings_own` RLS policies already in place).
**Working**: schema and RLS policies support the described flow.
**Missing**: job posting route, search/filter route, shortlist route, all UI.
**Needs testing**: n/a.
**Known issues**: none.
**Dependencies**: F1 (employer/trainee roles); whether `job_interests` persist after opt-out is an open PRD question (§14) — doesn't block building the base flow.

## F7 — Career Counseling Chatbot

**Description**: RAG chatbot over programme/FAQ content, scoped to informational Q&A.
**Requirements**: PRD §6.7.
**Acceptance criteria**: a trainee's question retrieves relevant corpus chunks and gets an answer grounded in them, not open-ended advice.
**Status**: 🔴 NOT STARTED
**Relevant files**: `supabase/migrations/20260901000001_init_schema.sql` (`chatbot_corpus_chunks` table, `embedding vector(1536)` — placeholder dimension).
**Working**: table exists with a pgvector column ready for similarity search.
**Missing**: everything — no Claude API/Anthropic SDK dependency anywhere in the repo, no embedding generation, no retrieval route, no chat UI.
**Needs testing**: n/a.
**Known issues**: none.
**Dependencies**: **embedding provider/model is undecided** (`docs/DATABASE.md` Open Items) — the `vector(1536)` column is a placeholder and will need recreating once a provider is chosen. This is worth resolving before writing embedding-generation code, though the table/route scaffolding could start regardless.

## F8 — Analytics Dashboard

**Description**: Admin view of programmes run, trainees by region, completion rates, certificates issued, placements.
**Requirements**: PRD §6.8.
**Acceptance criteria**: an admin can see aggregate counts/charts across the above dimensions.
**Status**: 🔴 NOT STARTED
**Relevant files**: none — no table, route, or UI exists anywhere.
**Working**: nothing.
**Missing**: everything, including schema (this is the one MVP feature with zero footprint at all, since it's a read/aggregation layer over other features' tables rather than needing its own table).
**Needs testing**: n/a.
**Known issues**: none.
**Dependencies**: F2, F3, F4, F6 (aggregates data those features produce) — meaningfully blocked in practice on those existing, even though not formally ⚪ BLOCKED.

## F9 — Offline Mobile App

**Description**: Download course videos and quiz content for offline use, take quizzes offline, queue and sync progress/attendance on reconnect.
**Requirements**: PRD §6.9.
**Acceptance criteria**: a trainee can download a module, use it offline, and have results sync via the same Express endpoints on reconnect with last-write-wins conflict resolution (DECISIONS.md #7).
**Status**: 🔴 NOT STARTED
**Relevant files**: `apps/mobile/App.tsx`, `apps/mobile/index.ts` (both unmodified Expo starter), `apps/mobile/app.json` (no offline-storage plugins configured).
**Working**: nothing — the mobile app is the stock "Open up App.tsx to start working on your app!" screen.
**Missing**: everything — no `expo-file-system`/`expo-sqlite` dependency, no download UI, no local queue, no sync manager, no navigation library even set up yet.
**Needs testing**: n/a.
**Known issues**: none.
**Dependencies**: F3 (needs real lesson content to download), F4 (needs real quizzes to take offline). Flagged in `DECISIONS.md`/`ARCHITECTURE.md` as the highest-complexity MVP module — budget real time here.

## F10 — NFC Profile Card

**Description**: Static NFC tag encoding a URL to a trainee's public profile page (skills, courses, certifications).
**Requirements**: PRD §6.10.
**Acceptance criteria**: a public, no-login profile page exists at a stable URL; tapping a pre-written NFC tag opens it on any phone (per DECISIONS.md #6 — no in-app NFC read/write code needed).
**Status**: 🔴 NOT STARTED
**Relevant files**: none.
**Working**: nothing.
**Missing**: the public profile page/route itself (this is the actual blocking piece — NFC tag-writing is an out-of-app process per DECISIONS.md, so the only code dependency is the profile page).
**Needs testing**: n/a.
**Known issues**: none.
**Dependencies**: F1 (profile data), F4 (certifications shown on the page) — the profile page is cheap once F1/F4 exist, since it reuses the certificate-verification page pattern.

---

## Infrastructure

### INFRA-1 — Monorepo scaffold

**Status**: ✅ COMPLETE. **Files**: `pnpm-workspace.yaml`, root `package.json`, `apps/{web,mobile,api}`, `packages/{constants,shared-types,validation,api-client}`. **Working**: `pnpm install`, `pnpm -r typecheck`, `pnpm -r lint` all pass; API boots and `/health` responds. **Missing**: nothing at scaffold level. **Known issues**: none.

### INFRA-2 — Database schema (MVP entities)

**Status**: ✅ COMPLETE for the entities defined so far. **Files**: `supabase/migrations/20260901000001_init_schema.sql`, `20260901000002_harden_security.sql`. **Working**: all 20 tables live on project `qkplydvsmikcprpmtlvi`, RLS enabled everywhere, security-advisor clean (only the intentional "no policy yet" INFO notices remain). **Missing**: this will need new migrations as each feature is built (e.g. certificate revocation column, chatbot embedding dimension fix) — expected growth, not a gap. **Known issues**: none.

### INFRA-3 — Supabase project connected

**Status**: ✅ COMPLETE. **Files**: `.mcp.json`. **Working**: MCP server authorized, project ref `qkplydvsmikcprpmtlvi` confirmed reachable, migrations applied through it. **Missing**: local `.env` files for each app still need the real keys filled in per-developer (each `.env.example` documents what's needed; service-role key was deliberately never written to a file by Claude). **Known issues**: none.

### INFRA-4 — Auth middleware wiring

**Status**: ✅ COMPLETE. **Files**: `apps/api/src/middleware/auth.ts`, `apps/api/src/supabaseClient.ts`, `apps/api/src/routes/profile.ts`. **Working**: `requireAuth`/`requireRole` wired into `GET /api/profile`, verified both by mocked unit tests and a live boot-test. **Missing**: nothing for the middleware itself; `requireRole` still needs a route that actually restricts by role to be tested (tracked under F1). **Known issues**: none.

### INFRA-5 — Testing framework

**Status**: 🟡 PARTIALLY COMPLETE. **Files**: `apps/api/package.json` (`vitest`, `supertest`, `@types/supertest`, `"test": "vitest run"`), `apps/api/src/routes/profile.test.ts` (reference example — mocks the Supabase client boundary, never hits a live project), root `package.json` (`"test": "pnpm -r --if-present test"`). **Working**: Vitest+Supertest fully set up and passing for `apps/api`. **Missing**: web (Vitest+RTL, proposed) and mobile (Jest/`jest-expo`+RN Testing Library, proposed) test setups don't exist yet. **Decision record**: DECISIONS.md #10 (Vitest chosen over the originally-proposed Jest for `apps/api`, due to ESM/TS friction).

### INFRA-6 — README

**Status**: ✅ COMPLETE. **Files**: `README.md` (setup steps, monorepo layout, run/test/lint commands, links to `docs/`). `apps/web/README.md` is still the untouched Vite template README — low priority to replace, not referenced by anything.

---

## Phase-2 features (explicitly out of MVP)

| ID  | Feature                              | Status         | Reference |
| --- | ------------------------------------ | -------------- | --------- |
| P1  | Skill-Gap Analysis                   | 🔴 NOT STARTED | PRD §13   |
| P2  | AI Career Counsellor (personalized)  | 🔴 NOT STARTED | PRD §13   |
| P3  | AI Job Matching                      | 🔴 NOT STARTED | PRD §13   |
| P4  | Employer Outcome Analysis            | 🔴 NOT STARTED | PRD §13   |
| P5  | Entrepreneurship Support             | 🔴 NOT STARTED | PRD §13   |
| P6  | Training & Learning Analytics (deep) | 🔴 NOT STARTED | PRD §13   |
| P7  | Government Scheme Matchmaking        | 🔴 NOT STARTED | PRD §13   |
| P8  | Alumni-as-Mentor Loop                | 🔴 NOT STARTED | PRD §13   |

No detailed acceptance criteria are written for these yet — PRD §13 itself defers their full requirements to a later planning pass; writing criteria now would be inventing requirements. Do not build these under the MVP label (`CLAUDE.md` rule).

---

## Complete implementation checklist

**F1 Auth**: [ ] role-based accounts (4 roles) usable end-to-end · [x] `requireAuth` wired into ≥1 route + tested · [x] `requireRole` tested against a role-restricted route · [ ] institution profile CRUD · [ ] employer org profile fields settable · [ ] bulk trainee import

**F2 Programme & Nomination**: [x] programme CRUD · [x] nomination/enrollment + approval workflow (trainee self-nominate; institution-initiated nomination ❓ see F2 entry) · [x] timetable per programme

**F3 LMS Core**: [x] course/module/lesson CRUD · [x] lesson video via YouTube (`video_id` + player) · [x] progress tracking (trainee-reported, own-row) · [x] Storage wiring for PDF/slides lessons (upload via Express, read via signed URL) · [x] ≥2-language content (`content_translations` CRUD + language switcher) · [x] ≥1 interactive element (`matching` exercise, jsonb config)

**F4 Assessment & Certification**: [x] MCQ builder · [x] server-side auto-grading · [x] PDF certificate generation · [x] unique ID/QR · [x] public verification page

**F5 Attendance**: [ ] QR generate/scan · [ ] face-rec library installed · [ ] embedding extraction + match · [ ] consent capture before any embedding write · [ ] QR fallback on low-confidence match

**F6 Employer Exchange**: [ ] job posting CRUD · [ ] trainee search/filter · [ ] visibility opt-in enforced in search · [ ] shortlist flow

**F7 Chatbot**: [ ] embedding provider chosen · [ ] corpus ingestion · [ ] retrieval route · [ ] Claude API integration · [ ] chat UI

**F8 Analytics Dashboard**: [ ] aggregate query endpoints · [ ] admin UI with charts

**F9 Offline Mobile**: [ ] module download · [ ] local storage (video + quiz) · [ ] offline quiz grading · [ ] sync queue · [ ] reconnect replay against same endpoints

**F10 NFC**: [ ] public profile page/route · [ ] NFC tag issuance process documented for staff (no in-app code needed)

**Infra**: [x] monorepo scaffold · [x] DB schema · [x] Supabase connected · [x] auth middleware wired + tested · [x] testing framework installed (API) · [ ] testing framework installed (web/mobile) · [x] root README

---

## Remaining work grouped by priority

**P0 — foundational, unblocks everything else**: ~~finish INFRA-4~~ done · ~~stand up INFRA-5 for API~~ done · ~~write INFRA-6~~ done · extend INFRA-5 to web/mobile when those apps get their first real code.

**P1 — the MVP spine**: ~~F2 Programme & Nomination~~ done, ~~F3 LMS Core~~ done, ~~F4 Assessment & Certification~~ done. **The MVP spine is complete.**

**P2**: F5 Attendance, F6 Employer Exchange.

**P3**: F7 Chatbot, F8 Analytics Dashboard.

**P4 — highest complexity, budget real time**: F9 Offline Mobile, F10 NFC (cheap once F1/F4 exist, but depends on them).

## Testing status

`apps/api`: Vitest + Supertest installed and passing — 15 test files, 129 tests total (`profile.test.ts`: 3, `programmes.test.ts`: 11, `nominations.test.ts`: 10, `timetable.test.ts`: 6, `courses.test.ts`: 11, `modules.test.ts`: 9, `lessons.test.ts`: 17, `lessonProgress.test.ts`: 8, `lessonContent.test.ts`: 10, `contentTranslations.test.ts`: 9, `assessments.test.ts`: 8, `assessmentQuestions.test.ts`: 12, `assessmentAttempts.test.ts`: 10, `certificates.test.ts`: 3, `certificateService.test.ts`: 2, covering auth/role/validation/success/404/409 paths — `lessons.test.ts` covers a full-URL-instead-of-ID video rejection, a video_id-cleared-to-null case, and interactive-config validation (too-few-pairs rejected, unknown exercise type rejected, valid config round-trips); `lessonProgress.test.ts` covers the not-started-yet-returns-null case and role-gating; `lessonContent.test.ts` mocks `supabaseAdmin.storage` (`upload`/`createSignedUrl`) alongside the usual table mock and exercises multipart upload via Supertest's `.attach()`; `contentTranslations.test.ts` covers malformed-locale rejection, empty-translation rejection, and a region-qualified locale (`en-IN`) succeeding; `assessmentQuestions.test.ts` specifically asserts `correct_option_id` is present for the admin authoring view and absent (`not.toHaveProperty`) for the trainee `/take` view; `assessmentAttempts.test.ts` asserts a client-supplied `score_percent`/`passed` in the request body is ignored and the server's own computed grade is used instead, and that a certificate-issuance failure still returns the graded attempt (not a 500) with a `certificateError` field; `certificateService.test.ts` lets `pdfkit`/`qrcode` run for real (not mocked) so a real PDF buffer is asserted on, only mocking the Supabase table/storage chain. Each test file inlines its own Supabase table-mock builder inside `vi.hoisted(...)` — an earlier attempt to share one via an imported helper module failed at runtime (`vi.mock`'s factory is hoisted above regular imports, so a helper referenced from `vi.hoisted` was undefined when the factory ran); this was caught by actually running the tests, not just typechecking, and is worth remembering before trying to extract a shared test helper again. `apps/web`: no test framework installed yet (first real components now exist — `AdminCourseManager`, `StudentLessonView`, `YouTubeVideoPlayer`, `LoginForm` — verified so far only via `tsc -b && vite build` + a manual dev-server boot, not automated tests); proposed Vitest+RTL, unconfirmed. `apps/mobile`: no tests, no framework installed yet — proposed Jest+RN Testing Library, unconfirmed. Every new Express route going forward should ship with at least one Supertest test per `CLAUDE.md`'s Testing Requirements; the same now applies to `apps/web` components once its test framework is confirmed.

## Known bugs

None identified in F1–F3's implemented code (verified via passing tests + live boot-tests each round). This section should populate honestly as implementation proceeds — do not let it stay empty by default just because nothing has been reported yet.

## Blockers/dependencies

Nothing is a hard blocker today. Real open items worth resolving soon (all already tracked in `PRD.md`/`DATABASE.md`, restated here only as a pointer):

- Embedding provider/model for F7's RAG retrieval — placeholder `vector(1536)` column will need recreating once decided.
- Face-rec library (`@vladmandic/human` recommended default, DECISIONS.md #5) not yet installed as a dependency anywhere.
- Exact 2nd MVP language for F3 — content mechanism can be built without this being decided.
- Certificate revocation field for F4 — deliberately deferred, not in schema.
- Hosting/deployment targets — doesn't block local development.

## Recommended implementation order

1. F1 completion (wire auth) + INFRA-5 (testing) + INFRA-6 (README) — see NEXT TASK.
2. F2 → F3 → F4 (the spine: programmes, learning content, certification).
3. F5 → F6 (attendance, employer exchange).
4. F7 → F8 (chatbot, analytics — mostly additive once the spine's data exists).
5. F9 → F10 (offline mobile, NFC — highest complexity/lowest urgency to start).

This matches the order already agreed earlier in this project's history (see `ARCHITECTURE.md` and `DECISIONS.md`).

## NEXT TASK

**Start F4 — Assessment & Certification.**

**Start F5 — Attendance (QR + Face Recognition).**

The MVP spine (F1's core auth, F2, F3, F4) is now done. F5 (PRD §6.5) is next per the recommended implementation order: QR-code session check-in, face-recognition check-in with recorded consent (required before any embedding write, per CLAUDE.md's DPDP-Act security rule), falling back to QR on a low-confidence face match. The `attendance_records` and `face_embeddings` tables already exist from the initial migration, both RLS-enabled with no policy yet (same "tables ready, zero app code" starting position every feature so far has begun from) — `timetable_sessions` (F2) is the thing attendance attaches to, already built and tested. Recommend starting with QR check-in first: it only needs a per-session QR payload (likely just the session id, scanned by a trainee's phone camera client-side — no new backend dependency) and an Express route recording `attendance_records` with `method: 'qr'`, following the exact CRUD-then-business-logic shape every feature so far has used. Face recognition is the genuinely new integration ground here (`@vladmandic/human`, the DECISIONS.md #5 default — not yet installed as a dependency anywhere in the repo) and should come second: it needs a consent-capture step before any embedding is written, an enrollment flow (capture + store a trainee's face embedding), and a match-at-check-in flow (capture, embed, pgvector cosine-similarity search against `face_embeddings`, fall back to QR below some confidence threshold — exact threshold `TBD`, will need a judgment call same as pass_threshold_percent was for F4). Also still worth doing opportunistically whenever picked up: F2 has no web UI yet, which is why F3/F4's admin/student pages currently take a raw programme UUID instead of a picker.

## Change log

- **2026-09-01 (9)**: Built F4 — Assessment & Certification — completing the MVP spine (F2/F3/F4). New migration `20260901000007_f4_assessment_certification.sql`: `assessments_read_authenticated` RLS policy; `assessment_questions` deliberately gets **no** policy (documented as DECISIONS.md #15) since `correct_option_id` must never reach a trainee — every read of that table goes through Express's `supabaseAdmin`, which strips the field on the trainee-facing route (`GET /assessments/:id/take`) but includes it on the admin-facing one. New routes: `apps/api/src/routes/assessments.ts` (CRUD), `assessmentQuestions.ts` (CRUD + the correct-answer-stripping trainee view), `assessmentAttempts.ts` (`POST` grades server-side from `assessment_questions.correct_option_id` — a client-supplied `score_percent`/`passed` is completely ignored, verified live by attempting to spoof a pass and getting graded 0%/failed anyway — then triggers certificate issuance on a pass), `certificates.ts` (`GET /api/certificates/:code`, the one route in the whole API with no `requireAuth`, per PRD §6.4's explicit no-login verification requirement) + matching `.test.ts` files (43 new tests). New `apps/api/src/certificateService.ts` + `.test.ts`: derives programme/institution via `assessment→module→course→programme→institution`, generates an `NCCT-XXXXXXXX` code (ambiguity-avoiding alphabet, no `0/O/1/I`), renders a real PDF (`pdfkit`) with an embedded QR (`qrcode`, linking to `{PUBLIC_WEB_URL}/?verify={code}`), uploads to a new **public** `certificates` Storage bucket (public is intentional — the `certificates` table's own RLS policy is already fully public, so the PDF being equally public isn't a bigger exposure), and inserts the certificate row — kept out of the route file so the multi-table lookup chain and PDF rendering are independently unit-testable (the test lets `pdfkit`/`qrcode` run for real rather than mocking them, catching actual wiring mistakes). Added `pdfkit`/`qrcode` + their `@types` packages to `apps/api` (first PDF/QR generation anywhere in this repo) and a new `PUBLIC_WEB_URL` env var (defaults to `http://localhost:5173`). New web: `AssessmentBuilder.tsx` (admin quiz builder, under the selected module, alongside lessons), `QuizTaker.tsx` (trainee quiz-taking + result + certificate link), `CertificateVerification.tsx` (public, no session dependency — `App.tsx` checks for a `?verify=` URL param and renders it **before** the login/loading gate, not after, so it genuinely never waits on or requires auth). Fixed a real bug caught before it shipped: two new components (`AssessmentBuilder`, `QuizTaker`) initially reset their own state inside a `useEffect` keyed on `moduleId` via synchronous `setState` calls — `oxlint`'s `react(set-state-in-effect)` rule flagged the cascading-render risk; fixed by having the parent mount each with `key={moduleId}` instead (a fresh mount is the idiomatic reset, not manual state-clearing) and simplifying the effects to just the data fetch. F4 moved 🔴→✅ — all four PRD §6.4 clauses implemented and tested; **the MVP spine (F2/F3/F4) is now complete**. 129 total API tests passing (35 new). Verified live end-to-end against the real Supabase project (not mocks): created a real assessment with 2 MCQ questions, confirmed the trainee `/take` view genuinely omits `correct_option_id`, submitted a 100%-correct attempt and received a real ~4.5KB PDF certificate (downloaded and confirmed the `%PDF` header), confirmed that certificate's Storage object is fetchable with **no signature at all** (unlike lesson-content's private bucket — this bucket is genuinely public), confirmed an all-wrong attempt scores 0%/fails and issues no certificate, confirmed a client-side score-spoofing attempt is ignored, confirmed an admin gets 403 submitting an attempt, and confirmed the public certificate-lookup endpoint returns 200 with denormalized trainee/programme/institution names for a real code and 404 for an unknown one. Full workspace typecheck/lint/test/build clean. NEXT TASK moved to F5 — Attendance (QR + Face Recognition), recommended to start with QR check-in (no new dependency) before face recognition (`@vladmandic/human`, genuinely new integration ground, not yet installed anywhere).
- **2026-09-01 (8)**: Closed out F3 entirely — added ≥2-language lesson content and one interactive lesson type, the last two items on F3's checklist, per explicit instruction to finish F3 before moving to F4. New migration `20260901000006_f3_translations_interactive.sql`: `content_translations_read_authenticated` RLS policy (the table existed since the initial migration but had no policy — default-deny — like every other not-yet-built-on table) and `lessons.interactive_config` (jsonb). New `apps/api/src/routes/contentTranslations.ts`: `GET /api/lessons/:id/translations` (any authenticated), `PUT`/`DELETE /api/lessons/:id/translations/:locale` (admin+trainer) — locale validated by shape only (`^[a-z]{2}(-[A-Z]{2})?$`), not a hardcoded enum, since PRD §14's "which 2nd MVP language" is still genuinely open; a translation needs at least one of title/body/storage_path or it's rejected as an empty row + `contentTranslations.test.ts` (9 tests). Extended `lessons.ts`/`lessons.test.ts` with `interactive_config` support: a zod discriminated union (`interactiveConfigSchema`) currently with one member (`matchingExerciseConfigSchema`, requiring ≥2 term/match pairs) so a second exercise type is a compile-time-visible change everywhere, not silent JSON drift (+3 tests). Documented the interactive-content-as-jsonb choice as DECISIONS.md #14, explicit about why this isn't normalized tables (PRD only requires one interactive element, not an exercise-authoring system — normalizing now would be premature). New shared code: `LOCALE_PATTERN`/`SUGGESTED_LOCALES`/`INTERACTIVE_EXERCISE_TYPES` (`packages/constants`), `ContentTranslation`/`InteractiveConfig`/`MatchingExerciseConfig` (`packages/shared-types`), `localeSchema`/`upsertContentTranslationSchema`/`interactiveConfigSchema` (`packages/validation`), translation fetch wrappers (`packages/api-client`). New `apps/web/src/MatchingExercise.tsx` — a tap-a-term-then-tap-its-match exercise component with client-side scoring (no server round-trip needed; deterministic-but-shuffled right-hand column so the exercise isn't trivial, doesn't reshuffle on every re-render). `StudentLessonView.tsx` gains a language switcher (swaps in a translation's title/body when the trainee picks a non-original locale) and renders `MatchingExercise` for interactive lessons; `AdminCourseManager.tsx` gains an "Interactive (matching)" content-type option (JSON textarea for the exercise config, validated client-side before submit — consistent with this repo's "minimal admin UI, not a full authoring experience" pattern) and a per-lesson translation form. F3 moved 🟡→✅ — all four PRD §6.3 clauses now implemented and tested. 94 total API tests passing (12 new). Verified live against the real Supabase project (not mocks): added a real Hindi translation through the running API and confirmed the UTF-8 round-trips byte-for-byte correctly — worth noting for future sessions: an initial live check appeared to show corrupted Devanagari (`??????`), which turned out to be a Windows shell/curl argv encoding artifact in the test harness itself, not an app bug, confirmed by re-sending the same payload via a file (`--data-binary @file`) instead of an inline `-d` string and comparing response bytes to the source; confirmed trainee-read/admin-write role gating and malformed-locale (400) rejection on translations; created a real interactive matching lesson through the API, confirmed a 1-pair config is rejected (400) and a valid 2-pair config round-trips correctly including through a trainee's `GET`. Full workspace typecheck/lint/test/build clean. NEXT TASK moved to F4 — Assessment & Certification, which starts from the same position F3 did (tables + one RLS policy already exist, zero app code).
- **2026-09-01 (7)**: Added Supabase Storage wiring for PDF/slides lessons, completing the last unstarted item on F3's checklist besides i18n/interactive-element. Provisioned a **private** `lesson-content` Storage bucket (25MB limit, PDF/PPT/PPTX only) directly via the Storage Management API — not a SQL migration, since buckets aren't plain Postgres rows; documented in `DATABASE.md`'s new Storage section rather than a migration file. New `apps/api/src/routes/lessonContent.ts`: `POST /api/lessons/:id/content` (admin+trainer, `multer` memory-storage multipart upload, MIME-type + size validated, uploads to Storage via `supabaseAdmin` then saves `storage_path` on the lesson) and `GET /api/lessons/:id/content-url` (any authenticated user, returns a 60-second signed URL after Express's own auth check — file bytes flow straight from Supabase's CDN to the client, not proxied through Express, same reasoning as the video path) + `lessonContent.test.ts` (10 tests, mocking `supabaseAdmin.storage.upload`/`createSignedUrl` alongside the usual table mock). Added `multer`+`@types/multer` to `apps/api` (a genuinely new need — nothing else in the repo parses multipart bodies) and `@ncct/constants` as a direct `apps/api` dependency (was only transitive before, broke typecheck once referenced directly). New `LESSON_FILE_MIME_TYPES`/`LESSON_FILE_MAX_BYTES` (`packages/constants`), `uploadLessonContent`/`getLessonContentUrl` (`packages/api-client`). Extended `AdminCourseManager.tsx` with a content-type selector on lesson creation and a file input for pdf/slides lessons; extended `StudentLessonView.tsx` with an "Open PDF/slides" button that fetches a fresh signed URL on click and opens it in a new tab. Documented the upload-through-Express/read-via-signed-URL split as DECISIONS.md #13, explicit that this is a narrow, server-authorized exception to "clients never call Supabase directly," not a general loosening of that rule. 82 total API tests passing (10 new). Verified live against the real Supabase project (not mocks): uploaded a real PDF through the running API, fetched it back via the returned signed URL and confirmed the bytes matched byte-for-byte, confirmed the same object is rejected (400) when requested _without_ a signature — proving the bucket is genuinely private, not just nominally so — confirmed a non-PDF file is rejected (400) and a trainee is blocked from uploading (403). Full workspace typecheck/lint/build clean. Noted one un-fixed gap rather than silently ignoring it: re-uploading a lesson's file overwrites the DB pointer but leaves the old Storage object orphaned (tracked in `DATABASE.md`'s Open Items). NEXT TASK updated: F3's remaining items (i18n, interactive element) don't block moving on — recommended next feature is F4 (Assessment & Certification), which starts from the same position F3 did (tables + one RLS policy already exist, no app code yet).
- **2026-09-01 (6)**: Added lesson progress tracking, closing out the next item on F3's checklist. New `apps/api/src/routes/lessonProgress.ts` (`GET`/`PATCH /api/lessons/:id/progress`, trainee-only, own-row via `req.supabase` — no `supabaseAdmin`, since the pre-existing `lesson_progress_own` RLS policy already covers this and no cross-user access is needed) + `lessonProgress.test.ts` (8 tests). New `LessonProgress` type (`packages/shared-types`), `updateLessonProgressSchema` (`packages/validation`), `getLessonProgress`/`updateLessonProgress` (`packages/api-client`). Wired a minimal "Mark complete" button into `StudentLessonView.tsx` — deliberately not real video-position tracking (no YouTube postMessage/playback listening), matching the original feature request's explicit instruction to add only minimum structure, not a full tracking system. 72 total API tests passing (8 new). Verified live against the real Supabase project using the two test users created last round: GET before any progress exists returns `null` (not a 404 — "not started" is a normal state, not an error); admin correctly gets 403 trying to write progress; trainee's PATCH upserts correctly on `(trainee_id, lesson_id)`; a partial PATCH (progress_percent + completed_at only) correctly left `last_position_seconds` from an earlier PATCH untouched, confirming the upsert only overwrites columns actually sent. Full workspace typecheck/lint/build clean. NEXT TASK moved to Supabase Storage wiring for PDF/slides lessons.
- **2026-09-01 (5)**: Started F3 — E-Learning/LMS Core, scoped specifically to a user request for YouTube-based lesson video playback (a full-stack request: DB, admin authoring, student playback, a reusable player component). Before building, discovered F3 had zero app-layer code (only the `courses`/`modules`/`lessons` tables existed) and `apps/web` was still the untouched Vite starter with no auth/routing/pages at all — flagged this to the user and got direction on scope (build a minimal real login instead of a throwaway token, and full 3-level CRUD instead of a lessons-only slice) before proceeding, rather than assuming either. New migration `20260901000005_f3_lms_core.sql`: `lessons.video_id` (text, `CHECK`-constrained to the 11-char YouTube ID format so a full URL can never be stored) + authenticated-read RLS on `courses`/`modules`/`lessons`. New routes `apps/api/src/routes/{courses,modules,lessons}.ts` (full CRUD, admin+trainer writes, any-authenticated reads) + matching `.test.ts` files (34 new tests, 64 total across the API). New shared code: `CONTENT_TYPES`/`YOUTUBE_VIDEO_ID_PATTERN` (`packages/constants`), `Course`/`Module`/`Lesson`/`ContentType` (`packages/shared-types`), course/module/lesson zod schemas incl. `youtubeVideoIdSchema` (`packages/validation`), course/module/lesson fetch wrappers (`packages/api-client`). First real `apps/web` code: `supabaseClient.ts` + `useSession.ts` + `LoginForm.tsx` (minimal Supabase-Auth login, resolving role via the existing `GET /api/profile`), `AdminCourseManager.tsx` (bare-bones course→module→lesson authoring incl. setting/clearing a lesson's `video_id`), `StudentLessonView.tsx` (browse to a lesson, watch its video), `YouTubeVideoPlayer.tsx` (reusable, responsive 16:9, no autoplay, graceful empty state for missing/invalid IDs), `App.tsx` rewritten to a login gate + role-branched view (replacing the unused Vite counter-demo placeholder). Documented the architectural choice as DECISIONS.md #12 (YouTube-unlisted-as-prototype-layer, explicit note that "unlisted" is not access control, migration note for swapping to private storage later without changing the lesson model). F3 moved 🔴→🟡 (video-lesson path + CRUD done; lesson progress, ≥2-language content, an interactive element, and PDF/slides Storage upload remain — deliberately not built this round per explicit scope). Verified live: full workspace typecheck/lint clean, all 64 API tests passing, `pnpm --filter web build` succeeds, the live Supabase project's new `CHECK` constraint and RLS policies confirmed via direct SQL query (regex accepts a valid ID and rejects both a full URL and a too-short string), security advisors show no new findings, both `apps/api` and `apps/web` boot with placeholder env vars and the new API routes correctly 401 unauthenticated requests. NEXT TASK stays on F3: lesson progress routes, then Storage wiring for PDF/slides.
- **2026-09-01 (4)**: Added `timetable_sessions` routes, completing F2. New migration `20260901000004_f2_timetable_rls.sql` (authenticated read policy, mirroring `programmes_read_authenticated`). New `apps/api/src/routes/timetable.ts` (2 endpoints) + `timetable.test.ts` (6 tests, including a `starts_at`/`ends_at` ordering validation case), `TimetableSession` type in `packages/shared-types`, `createTimetableSessionSchema` in `packages/validation`. F2 moved 🟡→✅ — all three PRD §6.2 clauses (CRUD, nomination workflow, timetable) implemented and tested (30 tests total across the API now). Added a ❓ NEEDS CLARIFICATION note on F2 rather than silently resolving it: whether PRD intends institution-initiated (not just trainee self-) nomination is genuinely ambiguous and the `nominations` table has no `institution_id` to support it as designed. Verified live: full workspace typecheck/lint clean, all 30 tests passing, live boot-test confirms the new router rejects unauthenticated requests. NEXT TASK moved to F3 — E-Learning/LMS Core.
- **2026-09-01 (3)**: Implemented F2's programme CRUD and nomination workflow. New migration `20260901000003_f2_programme_nomination_rls.sql` (RLS: authenticated read on `programmes`, own-row insert/select on `nominations` — admin writes use the service-role client per DECISIONS.md #9). New routes: `apps/api/src/routes/programmes.ts` (5 endpoints) and `apps/api/src/routes/nominations.ts` (3 endpoints), plus `PROGRAMME_MODES`/`NOMINATION_STATUSES`/`NOMINATION_DECISIONS` in `packages/constants`, `Programme`/`Nomination` types in `packages/shared-types`, and 3 zod schemas in `packages/validation`. 21 new tests (24 total across the API). Learned and documented a real Vitest gotcha: a shared test-mock helper imported into a `vi.hoisted(...)` block fails at runtime because `vi.mock`'s factory is hoisted above regular imports — caught by actually running the suite, not just typechecking; each test file now inlines its own mock builder instead. Added root `README.md` (INFRA-6 → ✅), closing out P0. F2 moved 🔴→🟡 (timetable sessions still missing). Verified live: full workspace typecheck/lint clean, all 24 tests passing, live boot-test confirms both new routers reject unauthenticated requests.
- **2026-09-01 (2)**: Wired `requireAuth`/`requireRole` into a first real route (`GET /api/profile`, `apps/api/src/routes/profile.ts`). Split `apps/api/src/index.ts` into `app.ts` (exported, testable Express app) + a thin `index.ts` entrypoint (DECISIONS.md #11). Stood up Vitest + Supertest for `apps/api` (DECISIONS.md #10 — Vitest chosen over the originally-proposed Jest due to ESM/TS friction); first test file passing (3 tests). Fixed a real `tsc` error surfaced by this work: `tsconfig.base.json`'s `declaration: true` was unused (nothing in the repo consumes built `.d.ts` output — every package's `types` field points at source) and broke on Express's non-portable inferred types; removed it. Verified with a live boot-test (real server, placeholder Supabase credentials) that `/health` and the new `/api/profile` 401 path both work outside the test mocks. Statuses moved: F1 stays 🟡 (still missing institution/employer/bulk-import) but is now demonstrably working, not just scaffolded; INFRA-4 🔵→✅; INFRA-5 🔴→🟡 (API only). NEXT TASK moved to the root README.
- **2026-09-01 (1)**: Initial creation of this tracker. Captured baseline state via full repository audit: 10 MVP features all 🔴/🟡 (only F1 has any app-layer code, and it's unwired), infra scaffold/schema/Supabase connection ✅, auth middleware 🔵 needs testing, testing framework and README 🔴. No bugs identified (nothing built yet to have bugs). No features found blocked.
