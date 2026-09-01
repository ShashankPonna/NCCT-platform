-- F3 (remaining scope): multi-language lesson content + interactive lessons.
--
-- `content_translations` already existed from the initial migration but had
-- RLS enabled with no policy (default-deny) — it gets its read policy here,
-- alongside the routes that need it, per DATABASE.md's stated convention.
--
-- `lessons.interactive_config` holds the definition of an interactive
-- lesson (currently only a term/definition matching exercise). Kept as
-- jsonb rather than new tables because the shape is exercise-type-specific
-- and still evolving — see docs/DECISIONS.md #14.

alter table public.lessons
  add column interactive_config jsonb;

create policy content_translations_read_authenticated on public.content_translations
  for select
  to authenticated
  using (true);
