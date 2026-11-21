-- Hospital announcements with administrator-only publishing controls.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  priority text not null default 'normal' check (priority in ('normal', 'important')),
  is_published boolean not null default false,
  created_by uuid not null references public.employee_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint announcement_publish_timestamp
    check ((is_published = false) or published_at is not null)
);

create index if not exists announcements_published_created_idx
  on public.announcements(is_published, created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "Employees read published announcements" on public.announcements;
create policy "Employees read published announcements"
  on public.announcements for select to authenticated
  using (is_published = true or public.is_citizen_madani_admin());

drop policy if exists "Admins create announcements" on public.announcements;
create policy "Admins create announcements"
  on public.announcements for insert to authenticated
  with check (
    public.is_citizen_madani_admin()
    and created_by = auth.uid()
    and is_published = false
    and published_at is null
  );

drop policy if exists "Admins update announcements" on public.announcements;
create policy "Admins update announcements"
  on public.announcements for update to authenticated
  using (public.is_citizen_madani_admin())
  with check (public.is_citizen_madani_admin());

grant select, insert on public.announcements to authenticated;
grant update (is_published, published_at) on public.announcements to authenticated;
