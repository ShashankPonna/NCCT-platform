-- Completes F2: any authenticated user can browse a programme's timetable,
-- mirroring programmes_read_authenticated. Admin session creation goes
-- through the service-role client in Express, so no write policy is needed.

create policy "timetable_sessions_read_authenticated" on public.timetable_sessions
  for select to authenticated using (true);
