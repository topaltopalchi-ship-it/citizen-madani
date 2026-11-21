-- Private administrative personnel case tracking. No document uploads are enabled.
create table if not exists public.personnel_cases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  case_type text not null check (case_type in ('employment_letter','insurance','leave','training','payroll','other')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null check (char_length(btrim(description)) between 5 and 4000),
  status text not null default 'submitted' check (status in ('submitted','reviewing','waiting_employee','completed','rejected')),
  admin_response text check (admin_response is null or char_length(admin_response) <= 3000),
  reviewed_by uuid references public.employee_profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'submitted' and reviewed_by is null and reviewed_at is null) or status <> 'submitted')
);

create index if not exists personnel_cases_owner_idx
  on public.personnel_cases(employee_id, created_at desc);
create index if not exists personnel_cases_queue_idx
  on public.personnel_cases(status, created_at desc);

alter table public.personnel_cases enable row level security;
revoke all privileges on public.personnel_cases from public, anon, authenticated;
grant select, insert, update on public.personnel_cases to authenticated;

drop policy if exists "Employees submit own personnel cases" on public.personnel_cases;
create policy "Employees submit own personnel cases"
  on public.personnel_cases for insert to authenticated
  with check (
    employee_id = auth.uid()
    and public.is_citizen_madani_active_employee()
  );

drop policy if exists "Employees and admins read personnel cases" on public.personnel_cases;
create policy "Employees and admins read personnel cases"
  on public.personnel_cases for select to authenticated
  using (
    public.is_citizen_madani_active_employee()
    and (employee_id = auth.uid() or public.is_citizen_madani_admin())
  );

drop policy if exists "Admins review personnel cases" on public.personnel_cases;
create policy "Admins review personnel cases"
  on public.personnel_cases for update to authenticated
  using (public.is_citizen_madani_admin())
  with check (
    public.is_citizen_madani_admin()
    and reviewed_by = auth.uid()
  );

comment on table public.personnel_cases is
  'Private employee administrative case requests; readable by the owner and active authorized admins only. Attachments are intentionally not supported.';
