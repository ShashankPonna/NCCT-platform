-- P3: AI Job Matching (ranked, embedding-based), promoted from Phase-2 into
-- MVP scope per docs/DECISIONS.md #28. Reuses F7's exact embedding
-- infrastructure rather than adding a second one: same local model
-- (Xenova/all-MiniLM-L6-v2, 384-d, docs/DECISIONS.md #17), same
-- L2-normalized-so-cosine-is-correct convention, same "PostgREST can't
-- express pgvector's <=> operator, so a SQL RPC does the ranking, revoked
-- from every client role except service_role" pattern `match_corpus_chunks`
-- already established.
--
-- `jobs.embedding` is nullable and best-effort: a job is embedded when
-- created/updated (apps/api/src/routes/jobs.ts), but that step is wrapped
-- in try/catch and never fails the write itself — a job with a null
-- embedding still posts successfully, it just won't appear in ranked
-- matches until a later write recomputes it. Existing jobs created before
-- this migration have no embedding and need a no-op PATCH (or a future
-- backfill pass) to appear in matches — see docs/DATABASE.md's Open Items.

alter table public.jobs
  add column embedding extensions.vector(384);

create index jobs_embedding_idx
  on public.jobs
  using hnsw (embedding extensions.vector_cosine_ops);

-- Ranks jobs against a trainee's own profile embedding (built at request
-- time from their certificates/skills, never stored — see
-- jobMatchingService.ts). Returns full job fields, not just an id, so the
-- caller doesn't need a second round-trip.
create function public.match_jobs(
  query_embedding extensions.vector(384),
  match_count int default 10
)
returns table (
  id uuid,
  employer_id uuid,
  title text,
  description text,
  required_skills text[],
  location text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    j.id,
    j.employer_id,
    j.title,
    j.description,
    j.required_skills,
    j.location,
    j.created_at,
    1 - (j.embedding <=> query_embedding) as similarity
  from public.jobs j
  where j.embedding is not null
  order by j.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_jobs(extensions.vector, int)
  from public, anon, authenticated;
grant execute on function public.match_jobs(extensions.vector, int)
  to service_role;
