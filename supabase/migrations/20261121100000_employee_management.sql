-- Admin-only employee directory maintenance.
-- This migration intentionally does not grant permission to change role or account identity.

-- Managers can view inactive accounts as well as active staff.
drop policy if exists "Admins read all employee profiles" on public.employee_profiles;
create policy "Admins read all employee profiles"
  on public.employee_profiles for select to authenticated
  using (public.is_citizen_madani_admin());

-- Only approved managers can update ordinary personnel fields.
-- The current manager cannot deactivate their own account and role is not grantable.
drop policy if exists "Admins update employee profiles" on public.employee_profiles;
create policy "Admins update employee profiles"
  on public.employee_profiles for update to authenticated
  using (public.is_citizen_madani_admin())
  with check (
    public.is_citizen_madani_admin()
    and (id <> auth.uid() or is_active = true)
  );

grant update (display_name, department, job_title, employee_code, is_active)
  on public.employee_profiles to authenticated;
