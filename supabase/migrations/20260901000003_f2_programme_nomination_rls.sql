-- Supports F2 (Programme & Nomination Management): trainees need to browse
-- programmes and self-nominate through their own JWT-scoped Supabase client
-- (docs/DECISIONS.md #9). Admin writes (create/update/delete programme,
-- decide a nomination) go through the service-role client in Express and so
-- don't need a policy here.

create policy "programmes_read_authenticated" on public.programmes
  for select to authenticated using (true);

-- A trainee can create and see their own nomination, but not edit/delete it
-- directly — status changes only happen via the admin-only decide route.
create policy "nominations_insert_own" on public.nominations
  for insert to authenticated with check (auth.uid() = trainee_id);

create policy "nominations_select_own" on public.nominations
  for select to authenticated using (auth.uid() = trainee_id);
