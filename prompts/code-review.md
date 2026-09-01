# Prompt: Code Review

For reviewing a diff, PR, or branch in this repo, prefer the repository's `/code-review` skill (correctness bugs + reuse/simplification/efficiency cleanups) over an ad hoc review. If it isn't available in the current session, follow this checklist:

1. Read `CLAUDE.md` for this project's specific rules before reviewing — a review here should check against this project's stated conventions, not generic best practice alone.
2. **Correctness first**: does the change do what it claims, including edge cases listed in `docs/PRD.md` §11 relevant to this area?
3. **Architecture conformance**: does it respect `CLAUDE.md`'s rules — no client-to-Supabase bypass, shared logic actually placed in `packages/*`, no duplicated backend logic between web and mobile?
4. **Scope discipline**: does it stay within MVP scope (`docs/PRD.md` §6/§12), or does it quietly implement a Phase-2 feature?
5. **Security**: server-side validation present for anything client-submitted (scores, face-match results, attendance); no secrets committed; consent captured before any biometric write.
6. **Reuse/simplification**: does it duplicate something already in `packages/*` or elsewhere in the app instead of reusing it? Is there unnecessary complexity for what the task needed?
7. **Tests**: present, and actually exercising the change (not just happy-path).
8. Report findings ranked by severity; don't pad the list with stylistic nitpicks that don't affect correctness or maintainability.
