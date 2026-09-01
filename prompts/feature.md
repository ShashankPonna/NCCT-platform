# Prompt: New Feature

1. Read `CLAUDE.md` and check `docs/PRD.md` — confirm this feature is in **MVP scope**, not Phase-2. If it's Phase-2, stop and flag that rather than building it.
2. Read the relevant section(s) of `docs/ARCHITECTURE.md` and `docs/DATABASE.md` for how this area is meant to fit together.
3. Inspect existing code in the affected app(s)/package(s) before writing anything — look for an existing pattern (route shape, service structure, component convention) to follow rather than inventing a new one.
4. Check `packages/shared-types`, `packages/api-client`, `packages/validation`, `packages/constants` for anything reusable before writing new logic. If both web and mobile need this feature, the logic layer belongs in `packages/*`, not duplicated in each app.
5. If a new DB table/column is needed, update `docs/DATABASE.md` as part of the same change.
6. Implement the minimal change that satisfies the requirement — no speculative abstraction, no unrelated cleanup.
7. Avoid adding a new dependency if an existing one in the monorepo already covers the need.
8. Write tests per `CLAUDE.md`'s testing requirements.
9. Self-review the diff: does it match existing conventions, does it avoid scope creep, does it respect the architecture rules in `CLAUDE.md` (no client-to-Supabase calls, no duplicated backend logic)?
