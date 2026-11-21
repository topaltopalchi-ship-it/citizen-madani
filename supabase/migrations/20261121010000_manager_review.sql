-- Manager authorization and secure request review workflow.
alter table public.employee_profiles
  add column if not exists role text not null default 'employee'
  check (role in ('employee', 'admin'));

-- SECURITY DEFINER avoids recursive RLS evaluation when policies ask whether
-- the current authenticated user is an administrator.
create or replace function public.is_citizen_madani_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  );
$$;

revoke all on function public.is_citizen_madani_admin() from public;
grant execute on function public.is_citizen_madani_admin() to authenticated;

drop policy if exists "Admins read all exchange requests" on public.exchange_requests;
create policy "Admins read all exchange requests"
  on public.exchange_requests for select to authenticated
  using (public.is_citizen_madani_admin());

drop policy if exists "Admins review exchange requests" on public.exchange_requests;
create policy "Admins review exchange requests"
  on public.exchange_requests for update to authenticated
  using (public.is_citizen_madani_admin())
  with check (
    public.is_citizen_madani_admin()
    and status in ('approved', 'rejected')
  );

-- Employees retain read/insert access only to their own requests.
grant update (status, reviewed_at) on public.exchange_requests to authenticated;

-- IMPORTANT: promote an authorized account manually using the Supabase SQL
-- editor after verifying the employee's identity and approval:
-- update public.employee_profiles set role = 'admin' where id = '<AUTH_USER_UUID>';
-- Never expose a service-role key in browser code.
