-- Citizen Madani: initial secure schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  job_title text not null default '',
  department text not null default '',
  hospital text not null default 'بیمارستان مدنی',
  role text not null default 'staff' check (role in ('staff','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exchange_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('department','hospital')),
  current_department text not null,
  desired_department text not null,
  desired_hospital text,
  note text not null default '',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hospital_required_for_hospital_exchange
    check (request_type <> 'hospital' or nullif(trim(desired_hospital), '') is not null)
);

create index if not exists exchange_requests_requester_created_idx
  on public.exchange_requests (requester_id, created_at desc);
create index if not exists exchange_requests_status_created_idx
  on public.exchange_requests (status, created_at desc);

alter table public.profiles enable row level security;
alter table public.exchange_requests enable row level security;

drop policy if exists "Authenticated staff can read directory" on public.profiles;
create policy "Authenticated staff can read directory"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Staff can create own profile" on public.profiles;
create policy "Staff can create own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and role = 'staff');

drop policy if exists "Staff can update own profile" on public.profiles;
create policy "Staff can update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = 'staff');

drop policy if exists "Users read own requests and admins read all" on public.exchange_requests;
create policy "Users read own requests and admins read all"
  on public.exchange_requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

drop policy if exists "Staff create own requests" on public.exchange_requests;
create policy "Staff create own requests"
  on public.exchange_requests for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists "Admins review requests" on public.exchange_requests;
create policy "Admins review requests"
  on public.exchange_requests for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

-- New accounts receive a basic staff profile. Admin role is assigned manually by an authorized operator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
