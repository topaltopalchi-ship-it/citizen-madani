-- Citizen Madani: employee directory and exchange requests
-- Apply with the Supabase SQL editor or Supabase CLI.
create extension if not exists pgcrypto;

create table if not exists public.employee_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'کارمند',
  department text,
  job_title text,
  employee_code text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exchange_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  request_type text not null check (request_type in ('تبادل بخش', 'تبادل بیمارستان')),
  from_unit text not null,
  to_unit text not null,
  note text check (char_length(note) <= 1500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint different_units check (from_unit <> to_unit)
);

create index if not exists exchange_requests_employee_created_idx
  on public.exchange_requests(employee_id, created_at desc);
create index if not exists employee_profiles_active_name_idx
  on public.employee_profiles(is_active, display_name);

alter table public.employee_profiles enable row level security;
alter table public.exchange_requests enable row level security;

-- Active staff can see the directory; every employee can always see their own profile.
drop policy if exists "Active employees can read directory" on public.employee_profiles;
create policy "Active employees can read directory"
  on public.employee_profiles for select to authenticated
  using (is_active = true or id = auth.uid());

-- Employees can only read their own requests and can only create requests for themselves.
drop policy if exists "Employees read own requests" on public.exchange_requests;
create policy "Employees read own requests"
  on public.exchange_requests for select to authenticated
  using (employee_id = auth.uid());

drop policy if exists "Employees create own pending requests" on public.exchange_requests;
create policy "Employees create own pending requests"
  on public.exchange_requests for insert to authenticated
  with check (
    employee_id = auth.uid()
    and status = 'pending'
    and reviewed_at is null
  );

-- No employee UPDATE/DELETE policy is intentionally provided. Request decisions
-- must be made by a trusted backend or an explicitly authorized admin workflow.

create or replace function public.create_employee_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.employee_profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'کارمند')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_employee_profile on auth.users;
create trigger on_auth_user_created_employee_profile
  after insert on auth.users
  for each row execute procedure public.create_employee_profile();

grant select on public.employee_profiles to authenticated;
grant select, insert on public.exchange_requests to authenticated;
