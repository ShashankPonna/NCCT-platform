# Prompt: Frontend Work (Web or Mobile)

1. Read `CLAUDE.md`, and `docs/PRD.md` for the relevant user flow / UI requirement.
2. Identify which app this belongs to: `apps/web` (React — admin/employer/public pages) or `apps/mobile` (React Native — trainee app). They are separate codebases; don't try to share UI components between them.
3. Before writing new UI, check `packages/api-client` for the data-fetching function this screen needs — add it there (typed, shared) if it doesn't exist yet, rather than fetching ad hoc from the component.
4. Check `packages/shared-types` for the response shape instead of redefining it locally.
5. Use `packages/validation` (zod) schemas for any form validation — client-side validation is UX only, the server is still the source of truth.
6. Follow existing component/screen patterns already in the app; don't introduce a new state-management approach or styling convention for just one screen.
7. Mobile-specific: if this screen needs offline support (per `docs/PRD.md` §6.9), check how the existing sync-queue pattern is implemented elsewhere before adding a new one.
8. Test the UI change by actually running the app (dev server / Expo) and exercising the flow, not just by reading the code — this project's own working agreement requires UI changes to be checked in a real browser/app before being called done.
