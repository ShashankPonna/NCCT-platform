-- F7: Career Counseling Chatbot (RAG over programme/FAQ content).
--
-- 1. Replaces the placeholder embedding dimension. The initial migration
--    created `embedding vector(1536)` with an explicit comment saying the
--    real provider wasn't chosen yet and the column should be recreated once
--    it was. It now is: `Xenova/all-MiniLM-L6-v2` run locally in the Express
--    service, which produces 384-dimensional normalized vectors — see
--    docs/DECISIONS.md #17 for why a local model rather than a hosted
--    embedding API. The table is empty, so this drops and re-adds rather
--    than attempting a conversion.
--
-- 2. Adds an HNSW cosine index. Embeddings are L2-normalized at generation
--    time, so cosine distance (`<=>`) is the right operator.
--
-- 3. Adds `match_corpus_chunks`, the similarity-search RPC. This exists
--    because PostgREST's query builder cannot express pgvector's `<=>`
--    operator — a SQL function is the standard Supabase pattern for vector
--    search. Its EXECUTE grant is revoked from public/anon/authenticated and
--    granted only to service_role, matching how 20260901000002 hardened
--    `handle_new_user` off the PostgREST RPC surface: retrieval is an Express
--    concern, not something a client should be able to call directly.
--
-- `chatbot_corpus_chunks` itself deliberately gets NO RLS policy — no client
-- ever reads it directly (the chat route returns only the answer plus the
-- source snippets it actually used), so it stays default-deny like
-- `assessment_questions`, per this repo's "add a policy only when a feature
-- route needs one" default (docs/DATABASE.md).

alter table public.chatbot_corpus_chunks drop column embedding;
alter table public.chatbot_corpus_chunks add column embedding extensions.vector(384);

create index chatbot_corpus_chunks_embedding_idx
  on public.chatbot_corpus_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create function public.match_corpus_chunks(
  query_embedding extensions.vector(384),
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  source_type text,
  source_id uuid,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.content,
    c.source_type,
    c.source_id,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chatbot_corpus_chunks c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_corpus_chunks(extensions.vector, int)
  from public, anon, authenticated;
grant execute on function public.match_corpus_chunks(extensions.vector, int)
  to service_role;
