# Prompt: Bug Fix

1. Read `CLAUDE.md` for project conventions before touching anything.
2. Reproduce the bug first — understand the actual failing behavior, not just the reported symptom.
3. Trace it to its root cause. Fix the root cause, not the symptom — don't patch a downstream effect if the real bug is upstream.
4. Inspect the surrounding code for the existing pattern before changing it; keep the fix consistent with how the rest of the module is written.
5. Check whether the same bug pattern exists elsewhere (e.g., the same unvalidated input handled in another route) — note it, but only fix it in scope if the user asked for a broader fix.
6. Make the minimal change that fixes the root cause — don't refactor unrelated code in the same diff.
7. Add a regression test that would have caught this bug.
8. Self-review: does the fix address the actual cause, does it avoid introducing a new edge case, does it stay minimal?
