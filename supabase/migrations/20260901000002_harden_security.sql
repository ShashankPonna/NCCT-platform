-- Follow-up migration addressing Supabase security-advisor findings raised
-- against 20260901000001_init_schema.sql.

-- Move the vector extension out of the public schema (Supabase convention:
-- extensions live in a dedicated `extensions` schema, which is on the
-- default search_path, so existing vector(...) column types keep resolving
-- since Postgres tracks the type by OID, not by schema-qualified name).
create schema if not exists extensions;
alter extension vector set schema extensions;

-- handle_new_user() is a trigger function, not meant to be callable directly
-- via the PostgREST RPC surface — revoke public/anon/authenticated execute.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
