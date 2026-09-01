# NCCT Cooperative Training Platform

An AI-enabled training ERP + e-learning platform for cooperative training institutions (NCCT / VAMNICOM / RICM / ICM), plus a skill-certification and employment exchange for trained rural youth.

Full product/technical context lives in [`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs/) — this file is just setup. Start with [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) for what's actually built vs. not.

## Stack

React (web) + React Native/Expo (mobile) + Node/Express (one API for both) + Supabase (Postgres/Auth/Storage/pgvector). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Layout

```
/apps/web       React admin/employer/public-pages app (Vite)
/apps/mobile    React Native trainee app (Expo)
/apps/api       Express API — the only thing that talks to Supabase
/packages/*     Shared types, validation schemas, API client, constants
/supabase/migrations   SQL migrations (source of truth for the DB schema)
/docs           PRD, architecture, database, decisions, implementation tracker
/prompts        Per-task-type workflow checklists for Claude Code
```

## Setup

```bash
pnpm install
```

Each app needs its own local `.env`, copied from that app's `.env.example`:

- `apps/api/.env` — `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (get these from your Supabase project's dashboard → Project Settings → API; the service role key is a real secret — never commit it), `PUBLIC_WEB_URL` (defaults to `http://localhost:5173` — used only to build the verification link embedded in a certificate's QR code).
- `apps/web/.env` — `VITE_API_URL` (defaults to `http://localhost:4000`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (same Supabase project as the API; the web app uses these only for Supabase Auth login — it never queries the database directly, see `docs/DECISIONS.md` #4).
- `apps/mobile/.env` — `EXPO_PUBLIC_API_URL` (defaults to `http://localhost:4000`).

## Running

```bash
pnpm dev:api      # Express API on :4000
pnpm dev:web      # Vite dev server
pnpm dev:mobile   # Expo dev server
```

## Other commands

```bash
pnpm typecheck    # every workspace project
pnpm lint         # every workspace project (each app uses its own linter — see CLAUDE.md)
pnpm test         # every workspace project's test suite (currently apps/api only)
pnpm format       # Prettier, whole repo
```

## Database

Schema changes go in `supabase/migrations/` as new SQL files, applied via the Supabase MCP server or the Supabase CLI. See [`docs/DATABASE.md`](docs/DATABASE.md) for the current entity map.
