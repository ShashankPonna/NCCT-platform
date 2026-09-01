# Prompt: Backend Work (Express API)

1. Read `CLAUDE.md`, and the relevant section(s) of `docs/ARCHITECTURE.md` (§6 Backend Architecture) and `docs/DATABASE.md`.
2. Follow the existing layering: `routes` → `controllers` → `services` → Supabase client. Don't put business logic directly in a route handler if the existing codebase already separates it into a service.
3. Every route needs: JWT auth check, role check (middleware), and request validation via a `packages/validation` zod schema — check for an existing schema before writing a new one.
4. If the route is consumed by both web and mobile (most are, per the shared-backend architecture rule), make sure the response shape is defined once in `packages/shared-types` and add/update the corresponding function in `packages/api-client`.
5. Never trust client-submitted values for anything security- or grading-relevant (quiz scores, face-match confidence, attendance status) — recompute/verify server-side.
6. If this touches face recognition, PDF certificate generation, or chatbot orchestration, keep that logic in the relevant `services` module (see ARCHITECTURE.md §6), not inline in the controller.
7. If a new table/column is needed, update `docs/DATABASE.md` in the same change.
8. Write a Supertest covering the success path and the main failure path before considering the route done.
