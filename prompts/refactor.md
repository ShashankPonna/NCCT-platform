# Prompt: Refactor

1. Read `CLAUDE.md` and confirm this is a pure refactor — no behavior change. If the request also changes behavior, treat that part as a feature/bug-fix instead and follow that prompt for it.
2. Inspect the existing code thoroughly before changing structure — understand why it's written the way it is before assuming it's wrong.
3. Reuse existing patterns from elsewhere in the monorepo rather than introducing a new convention for just this one area.
4. Avoid over-engineering: don't introduce an abstraction to handle hypothetical future cases that aren't needed today.
5. If this refactor reverses a decision recorded in `docs/DECISIONS.md`, add a new entry there explaining why, and mark the old one Superseded — don't diverge from a recorded decision silently.
6. Keep the diff scoped to the refactor — no drive-by feature additions.
7. Run existing tests to confirm behavior is unchanged; add tests first if the area being refactored isn't already covered.
8. Self-review: is behavior provably unchanged, is the result actually simpler (not just different), does it match conventions used elsewhere in the codebase?
