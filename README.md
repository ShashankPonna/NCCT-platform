# EduDisha · Cooperative Training & Employment Platform

An AI-enabled digital ecosystem for cooperative training institutions (NCCT / VAMNICOM / RICM / ICM): a **training ERP + e-learning platform** for trainers and trainees, plus a **skill-certification and employment exchange** that connects trained rural youth with cooperative employers.

One Express API and one database serve both the web app and the Android/iOS apps.

**Live:** web app https://ncct-platform-1.onrender.com · API https://ncct-platform.onrender.com
*(Free Render tier: the first request after idle takes ~40 s to wake the API.)*

## What it does

| Area | Features |
| --- | --- |
| **Training ERP** | Institutions, programmes (online / offline / hybrid), trainer assignment, trainee self-nomination with admin approve / waitlist / reject, bulk trainee import (CSV), timetable, hostel & room allocation |
| **Attendance** | 6-digit session codes and QR check-in, face-recognition check-in (with recorded DPDP consent), NFC-card kiosk lookup, staff manual marking, per-session roster |
| **E-learning** | Courses → modules → lessons (text, YouTube / self-hosted video, PDF, interactive matching exercises), Hindi translations, offline downloads with automatic sync on the mobile app |
| **Assessment** | Graded module tests and practice quizzes, CSV bulk question import, server-side grading (the client never reports its own score), attempt limits, faculty gradebook with **Excel export** |
| **Certification** | Certificates issued automatically on completion, PDF with QR code, **public no-login verification** at `/?verify=CODE`, NFC-tappable public profile card |
| **Employment exchange** | Employer job postings with skill tags, opt-in trainee visibility, talent search, shortlist → contacted pipeline |
| **AI** | Skill-gap analysis, AI job matching, FAQ chatbot (Groq + pgvector RAG over an admin-curated knowledge base), AI career counsellor, dropout-risk flags on the analytics dashboard |
| **Platform** | Role-based access (admin / trainer / trainee / employer), in-app notifications, English + हिन्दी UI, light/dark themes, font-size controls, installable Android & iOS apps |

Full scope and what is deliberately Phase 2: [`docs/PRD.md`](docs/PRD.md). Real status of every feature: [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md).

## Demo accounts

The live deployment is seeded with a connected demo dataset (programmes, enrolments, lessons, tests, attempts, certificates, jobs and shortlists).

| Role | Email |
| --- | --- |
| Admin | `demo.admin@ncct.test` |
| Trainer | `demo.trainer1@ncct.test` (Rajesh Kumar), `demo.trainer2@ncct.test` (Meera Iyer) |
| Trainee | `demo.trainee1@ncct.test` (Asha Patil) … `demo.trainee6@ncct.test` |
| Employer | `demo.employer1@ncct.test` (Sahakar Dairy Cooperative), `demo.employer2@ncct.test` |

The shared demo password is provided with the SIH submission. It is not committed here, because this repository is public.

## Architecture

```
apps/web        React + Vite + TypeScript: every role's UI (admin, trainer, trainee, employer, public pages)
apps/mobile     Capacitor shell that packages apps/web's build as native Android and iOS apps (no separate UI code)
apps/api        Node + Express + TypeScript: the only component that talks to Supabase
packages/       shared-types · validation (zod, used by API and forms) · api-client · constants
supabase/       SQL migrations, the source of truth for the schema
docs/           PRD, architecture, database, decisions log, implementation tracker
```

- **Supabase**: Postgres + Auth + Storage + pgvector. Clients never query Supabase directly. Every read and write goes through the API, which enforces role checks on top of row-level security.
- **Face recognition**: `@vladmandic/human`, with matching done server-side.
- **AI**: Groq for generation (FAQ chatbot, tool-calling career counsellor, skill-gap ranking); embeddings run locally.

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DATABASE.md`](docs/DATABASE.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Running locally

Requires Node ≥ 22.18 and pnpm.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # fill in the values below
cp apps/web/.env.example apps/web/.env
pnpm dev:api    # API on http://localhost:4000
pnpm dev:web    # web app on http://localhost:5173
```

**`apps/api/.env`**

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: from Supabase → Project Settings → API. The service-role key is a secret; never commit it.
- `PUBLIC_WEB_URL`: the web app's URL, embedded in certificate QR codes.
- `GROQ_API_KEY`: the only AI key. It powers the FAQ chatbot, the career counsellor and the skill-gap ranking. Without it those features show a clear "unavailable" message and everything else still works.
- `B2_*`: optional. Only needed for self-hosted video uploads; YouTube lessons need nothing.

**`apps/web/.env`**: `VITE_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The web app uses Supabase only for login.

**Database:** apply the files in `supabase/migrations/` in order, using the Supabase SQL editor or CLI.

**Mobile:**
- `pnpm --filter mobile android` or `pnpm --filter mobile ios` builds the web app, syncs it into the native project and opens it in Android Studio / Xcode.
- Set `VITE_API_URL` to a reachable API first; `localhost` means the phone itself.

## Quality checks

```bash
pnpm typecheck   # every workspace project
pnpm lint        # ESLint for api/packages, oxlint for web
pnpm test        # Vitest + Supertest: 633 API tests + api-client tests
pnpm --filter web build
```

API tests mock the Supabase boundary and never touch a live project. Before submission, the platform was also exercised end-to-end against the real API and database:
- **API walkthrough**: 46 checks covering every feature as every role, including 401/403 and anti-tampering cases.
- **Headless-browser sweep**: every screen for all four roles, at desktop and phone sizes, in light and dark themes.
