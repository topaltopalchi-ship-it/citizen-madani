-- Immutable audit trail for personnel-case lifecycle changes.
create table if not exists public.personnel_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.personnel_cases(id) on delete cascade,
  actor_id uuid references public.employee_profiles(id) on delete set null,
  event_type text not null check (event_type in ('created','status_changed','response_updated')),
  old_status text,
  new_status text,
  note text check (note is null or char_length(note) <= 3000),
  created_at timestamptz not null default now()
);
create index if not exists personnel_case_events_case_idx
  on public.personnel_case_events(case_id, created_at desc);

alter table public.personnel_case_events enable row level security;
revoke all privileges on public.personnel_case_events from public, anon, authenticated;
grant select on public.personnel_case_events to authenticated;

drop policy if exists "Case owners and admins read case history" on public.personnel_case_events;
create policy "Case owners and admins read case history"
  on public.personnel_case_events for select to authenticated
  using (
    exists (
      select 1 from public.personnel_cases c
      where c.id = case_id
        and public.is_citizen_madani_active_employee()
        and (c.employee_id = auth.uid() or public.is_citizen_madani_admin())
    )
  );

create or replace function public.log_personnel_case_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    insert into public.personnel_case_events(case_id, actor_id, event_type, new_status, note)
    values (new.id, auth.uid(), v_event_type, new.status, 'پرونده ایجاد شد');
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.personnel_case_events(case_id, actor_id, event_type, old_status, new_status, note)
    values (new.id, auth.uid(), 'status_changed', old.status, new.status, new.admin_response);
  elsif old.admin_response is distinct from new.admin_response then
    insert into public.personnel_case_events(case_id, actor_id, event_type, old_status, new_status, note)
    values (new.id, auth.uid(), 'response_updated', old.status, new.status, new.admin_response);
  end if;
  return new;
end;
$$;

drop trigger if exists personnel_case_event_audit on public.personnel_cases;
create trigger personnel_case_event_audit
  after insert or update of status, admin_response on public.personnel_cases
  for each row execute function public.log_personnel_case_event();

comment on table public.personnel_case_events is
  'Append-only audit events for personnel cases; visible only to case owner and authorized admins.';
