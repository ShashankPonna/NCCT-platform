# Prompt: Testing

1. Read `CLAUDE.md`'s Testing Requirements section — the proposed defaults are Jest + React Testing Library (web), Jest + RN Testing Library (mobile), Supertest (API). **Confirm these are actually configured in `package.json`/CI before assuming them** — they were proposed, not yet verified as set up.
2. Inspect existing tests in the affected app/package first and match their structure/naming rather than inventing a new test style.
3. For a new Express route: at least one request-level test via Supertest covering the success path and the main failure path (auth rejection, validation failure).
4. For a new shared-package function (`packages/*`): a unit test, since both web and mobile depend on it — a bug there breaks both clients at once.
5. For a bug fix: a regression test reproducing the original failure before the fix, confirming it fails without the fix and passes with it.
6. Don't test implementation details (internal function calls, state shape) — test observable behavior (response shape, rendered output, returned value).
7. Don't add tests for scenarios that can't occur given the code's actual constraints — no defensive tests for impossible states.
8. Run the full relevant test suite before considering the task done, not just the new test.
