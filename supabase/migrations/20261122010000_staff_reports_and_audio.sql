-- Private employee incident reports and experience submissions with optional audio.
create table if not exists public.staff_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.employee_profiles(id) on delete cascade,
  report_type text not null check (report_type in ('error', 'experience')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 5 and 5000),
  department text check (department is null or char_length(department) <= 100),
  occurred_at timestamptz,
  audio_path text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'closed')),
  admin_response text check (admin_response is null or char_length(admin_response) <= 3000),
  reviewed_by uuid references public.employee_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audio_path is null or audio_path like reporter_id::text || '/%'),
  check ((status = 'new' and reviewed_by is null and reviewed_at is null) or status <> 'new')
);

create index if not exists staff_reports_owner_idx
  on public.staff_reports(reporter_id, created_at desc);
create index if not exists staff_reports_admin_queue_idx
  on public.staff_reports(status, created_at desc);

alter table public.staff_reports enable row level security;
revoke all privileges on public.staff_reports from public, anon, authenticated;
grant select, insert, update on public.staff_reports to authenticated;

drop policy if exists "Employees submit own private reports" on public.staff_reports;
create policy "Employees submit own private reports"
  on public.staff_reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.is_citizen_madani_active_employee());

drop policy if exists "Employees read own reports and admins read all" on public.staff_reports;
create policy "Employees read own reports and admins read all"
  on public.staff_reports for select to authenticated
  using (public.is_citizen_madani_active_employee() and (reporter_id = auth.uid() or public.is_citizen_madani_admin()));

drop policy if exists "Admins review staff reports" on public.staff_reports;
create policy "Admins review staff reports"
  on public.staff_reports for update to authenticated
  using (public.is_citizen_madani_admin())
  with check (public.is_citizen_madani_admin() and reviewed_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-report-audio', 'staff-report-audio', false, 10485760, array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Employees upload own report audio" on storage.objects;
create policy "Employees upload own report audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'staff-report-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_citizen_madani_active_employee()
  );

drop policy if exists "Report owners and admins read report audio" on storage.objects;
create policy "Report owners and admins read report audio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'staff-report-audio'
    and public.is_citizen_madani_active_employee()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.staff_reports r
        where r.audio_path = storage.objects.name
          and public.is_citizen_madani_admin()
      )
    )
  );

drop policy if exists "Report owners delete unlinked audio" on storage.objects;
create policy "Report owners delete unlinked audio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'staff-report-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_citizen_madani_active_employee()
    and not exists (select 1 from public.staff_reports r where r.audio_path = storage.objects.name)
  );

comment on table public.staff_reports is
  'Private employee error reports and experience submissions; only the reporter and authorized admins can read them.';
