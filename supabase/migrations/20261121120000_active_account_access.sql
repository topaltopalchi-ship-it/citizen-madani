-- Enforce active employee status at the data layer and reset broad table grants.
-- Inactive accounts retain access only to their own basic profile so the app can
-- explain the account state; all operational data access requires active status.

create or replace function public.is_citizen_madani_active_employee()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employee_profiles p
    where p.id = auth.uid() and p.is_active = true
  );
$$;

revoke all on function public.is_citizen_madani_active_employee() from public;
grant execute on function public.is_citizen_madani_active_employee() to authenticated;

-- Active staff can see active colleagues; inactive staff can only see their own profile.
drop policy if exists "Active employees can read directory" on public.employee_profiles;
create policy "Active employees can read directory"
  on public.employee_profiles for select to authenticated
  using (
    id = auth.uid()
    or (is_active = true and public.is_citizen_madani_active_employee())
  );

-- Keep an employee's own request history visible only while their account is active.
drop policy if exists "Employees read own requests" on public.exchange_requests;
create policy "Employees read own requests"
  on public.exchange_requests for select to authenticated
  using (employee_id = auth.uid() and public.is_citizen_madani_active_employee());

drop policy if exists "Employees create own pending requests" on public.exchange_requests;
create policy "Employees create own pending requests"
  on public.exchange_requests for insert to authenticated
  with check (
    employee_id = auth.uid()
    and public.is_citizen_madani_active_employee()
    and status = 'pending'
    and reviewed_at is null
  );

-- Published announcements and private messages are available only to active staff.
drop policy if exists "Employees read published announcements" on public.announcements;
create policy "Employees read published announcements"
  on public.announcements for select to authenticated
  using (
    (is_published = true and public.is_citizen_madani_active_employee())
    or public.is_citizen_madani_admin()
  );

drop policy if exists "Participants read direct messages" on public.direct_messages;
create policy "Participants read direct messages"
  on public.direct_messages for select to authenticated
  using (
    public.is_citizen_madani_active_employee()
    and (sender_id = auth.uid() or recipient_id = auth.uid())
  );

drop policy if exists "Recipients mark messages read" on public.direct_messages;
create policy "Recipients mark messages read"
  on public.direct_messages for update to authenticated
  using (recipient_id = auth.uid() and public.is_citizen_madani_active_employee())
  with check (recipient_id = auth.uid() and public.is_citizen_madani_active_employee());

-- Revoke broad defaults first, then grant only the operations the UI requires.
revoke all privileges on table public.employee_profiles from anon, authenticated;
grant select on public.employee_profiles to authenticated;
grant update (display_name, department, job_title, employee_code, is_active)
  on public.employee_profiles to authenticated;

revoke all privileges on table public.exchange_requests from anon, authenticated;
grant select, insert on public.exchange_requests to authenticated;
grant update (status, reviewed_at) on public.exchange_requests to authenticated;

revoke all privileges on table public.announcements from anon, authenticated;
grant select, insert on public.announcements to authenticated;
grant update (is_published, published_at) on public.announcements to authenticated;

revoke all privileges on table public.direct_messages from anon, authenticated;
grant select, insert on public.direct_messages to authenticated;
grant update (read_at) on public.direct_messages to authenticated;
