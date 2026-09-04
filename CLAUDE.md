# CLAUDE.md

Persistent instructions for Claude Code working in this repository. Keep this file concise — detailed context lives in `docs/`, linked below. Do not copy PRD/architecture content back into this file; update the source doc and link to it instead.

## Project Overview

An AI-enabled digital ecosystem for cooperative training institutions (NCCT / VAMNICOM / RICM / ICM): a training ERP + e-learning platform for trainers/trainees, plus a skill-certification and employment exchange for trained rural youth. Full detail: [docs/PRD.md](docs/PRD.md).

## Tech Stack

| Layer            | Choice                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web              | React (TypeScript)                                                                                                                                |
| Mobile           | React (Vite/TypeScript), packaged as a native Android app via Capacitor — not React Native/Expo; see [docs/DECISIONS.md](docs/DECISIONS.md) #19  |
| Backend          | Node.js + Express (TypeScript) — single API for both clients                                                                                      |
| Database         | Supabase (Postgres + Auth + Storage + pgvector)                                                                                                   |
| Face recognition | `@vladmandic/human` (default); InsightFace `buffalo_l` via `onnxruntime-node` as swap-in alternative — see [docs/DECISIONS.md](docs/DECISIONS.md) |
| Chatbot          | Gemini API + pgvector RAG — see [docs/DECISIONS.md](docs/DECISIONS.md) #25 (amends #17)                                                          |
| Hosting/CI       | TBD — see Open Questions in [docs/PRD.md](docs/PRD.md)                                                                                            |

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Architecture Rules

- **Monorepo**: `/apps/web`, `/apps/mobile`, `/apps/api`, `/packages/{shared-types,api-client,validation,constants}`. `apps/mobile` has no `src/` of its own — it's a Capacitor shell wrapping `apps/web`'s own build (`webDir` points at `apps/web/dist`), so the same app, same role branching, and all roles ship to mobile, not a trainee-only subset. See [docs/DECISIONS.md](docs/DECISIONS.md) #22 (amends #19).
- **One backend, one database** for both web and mobile. Never build a mobile-only or web-only endpoint for something both clients need.
- **Clients never call Supabase directly.** All reads/writes go through the Express API, which centralizes auth checks, RLS-equivalent business rules, face-recognition matching, PDF generation, and chatbot orchestration. Supabase client credentials live server-side only.
- Before adding a new pattern (new endpoint shape, new state pattern, new shared type), check `/packages` and existing `/apps/api` routes for something reusable first.

## Coding Conventions

- TypeScript throughout, no implicit `any`.
- Request/response and DB-row types live in `packages/shared-types`; don't redefine the same shape in both a client and the API.
- Validation schemas (`zod`) live in `packages/validation` and are used on both the Express route (server-side truth) and the client form (UX only) — never validate only on the client.
- Linting/formatting: Prettier formats the whole repo. Linting is per-app: `apps/api` and `packages/*` use the root ESLint flat config (`eslint.config.js`); `apps/web` and `apps/mobile` both use `oxlint` (Vite's scaffolded default) rather than ESLint, since both are now Vite apps — don't add a second linter to either without reason.

## Project-Specific Development Rules

- Check [docs/PRD.md](docs/PRD.md)'s MVP vs Phase-2 scope before building a feature — Phase-2 items (Employer Outcome Analysis, Entrepreneurship Support, Government Scheme Matchmaking, Alumni Mentor Loop) are explicitly **not** MVP. Skill-Gap Analysis, AI Career Counsellor, AI Job Matching, and deep Training & Learning Analytics were promoted into scope — see [docs/DECISIONS.md](docs/DECISIONS.md) #26–#29.
- Any new/changed DB table: update [docs/DATABASE.md](docs/DATABASE.md) in the same change.
- Any reversal or addition to a recorded architectural decision: add an entry to [docs/DECISIONS.md](docs/DECISIONS.md) rather than silently diverging from it.
- Offline sync uses simple timestamp/last-write-wins conflict resolution by design — do not introduce a CRDT/OT sync engine (see DECISIONS.md).
- NFC scope is a static NDEF URI record to a public profile page — do not build custom in-app NFC read/write logic for MVP (see DECISIONS.md).

## Security Rules

- Auth via Supabase Auth JWT; every Express route checks role via middleware in addition to any Supabase RLS policy (defense in depth, not either/or).
- Never trust a client-reported quiz score, face-match result, or attendance status — always recompute/verify server-side.
- Face enrollment requires recorded consent (`consent_given_at`) before any biometric embedding is stored — required under India's DPDP Act 2023.
- No secrets, API keys, or `.env` files committed. Use `.env.example` for documenting required variables.

## Testing Requirements

- **API**: Vitest + Supertest — confirmed and in use (`apps/api/src/routes/profile.test.ts` is the reference example: mock the Supabase client boundary via `vi.mock("../supabaseClient.js", ...)`, never hit a live Supabase project from a test). Jest was the original proposed default but was dropped in favor of Vitest for this ESM/TypeScript app — see [docs/DECISIONS.md](docs/DECISIONS.md) #10.
- **Web / Mobile**: still proposed, not yet confirmed — Vitest + React Testing Library for both (natural fit now that both are Vite apps; mobile no longer needs a separate RN test stack — see [docs/DECISIONS.md](docs/DECISIONS.md) #19). Confirm before the first web/mobile test is written.
- Every new Express route needs at least one request-level test (success + a failure path); every new shared-package function needs a unit test.

## Important Commands

- `pnpm install` — install all workspace dependencies (run from repo root).
- `pnpm dev:api` / `pnpm dev:web` / `pnpm dev:mobile` — run one app's dev server.
- `pnpm lint` — lint every workspace project (each app's own linter, see Coding Conventions).
- `pnpm typecheck` — typecheck every workspace project.
- `pnpm format` / `pnpm format:check` — Prettier write/check across the repo.
- `pnpm test` — run every workspace project's test suite (currently only `apps/api` has one; see Testing Requirements).

## Development Workflow

1. Read this file, [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) (current real status of every feature), and the relevant doc(s) in `docs/`.
2. Inspect existing code in the affected app/package before writing anything new.
3. Reuse existing patterns/utilities in `packages/*` where they fit.
4. Implement the minimal change that satisfies the requirement.
5. Test it.
6. Self-review the diff against this file's rules before considering the task done.
7. Update [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) if this change moved a feature's status, closed a gap, or introduced a known issue — it's a living document, not a one-time snapshot.

See `prompts/` for task-type-specific checklists (feature, bug-fix, refactor, code-review, testing, frontend, backend).

## Things Claude Must Avoid

- Do not implement Phase-2 features under the MVP label.
- Do not add a new dependency when an existing one in the monorepo already covers the need.
- Do not build a second backend or duplicate business logic between web and mobile.
- Do not have clients call Supabase directly, bypassing Express.
- Do not invent requirements not present in `docs/PRD.md` — mark gaps as `TBD`/`OPEN QUESTION` there instead.
- Do not gold-plate: no DRM system, no CRDT sync engine, no custom NFC protocol — these were deliberately scoped out (see DECISIONS.md).

## References

- [docs/PRD.md](docs/PRD.md) — what to build
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it's structured
- [docs/DATABASE.md](docs/DATABASE.md) — data model
- [docs/DECISIONS.md](docs/DECISIONS.md) — why key choices were made
- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) — current status of every feature (living document — keep it updated)
- `prompts/` — per-task-type workflows
