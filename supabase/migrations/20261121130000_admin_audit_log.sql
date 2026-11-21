-- Read-only administrative audit trail for important staff and workflow changes.
-- The browser cannot insert audit events; trusted database triggers write them.

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid,
  entity_type text not null check (entity_type in ('employee_profiles', 'exchange_requests', 'announcements')),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_actor_created_idx
  on public.admin_audit_log(actor_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all privileges on table public.admin_audit_log from public, anon, authenticated;
grant select on public.admin_audit_log to authenticated;

drop policy if exists "Admins read audit log" on public.admin_audit_log;
create policy "Admins read audit log"
  on public.admin_audit_log for select to authenticated
  using (public.is_citizen_madani_admin());

create or replace function public.capture_citizen_madani_admin_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_fields jsonb;
  event_action text;
  event_target uuid;
begin
  if tg_table_name = 'employee_profiles' then
    select coalesce(jsonb_agg(changed.key order by changed.key), '[]'::jsonb)
      into changed_fields
      from jsonb_object_keys(to_jsonb(new)) as changed(key)
     where (to_jsonb(new) -> changed.key) is distinct from (to_jsonb(old) -> changed.key)
       and changed.key not in ('updated_at', 'role');
    if changed_fields = '[]'::jsonb then
      return new;
    end if;
    event_action := 'employee_profile_updated';
    event_target := new.id;
  elsif tg_table_name = 'exchange_requests' then
    if old.status is not distinct from new.status then
      return new;
    end if;
    changed_fields := jsonb_build_object('status_changed', true);
    event_action := 'exchange_request_reviewed';
    event_target := new.employee_id;
  elsif tg_table_name = 'announcements' then
    if old.is_published is not distinct from new.is_published then
      return new;
    end if;
    changed_fields := jsonb_build_object('publication_changed', true);
    event_action := case when new.is_published
      then 'announcement_published'
      else 'announcement_unpublished'
    end;
    event_target := new.created_by;
  else
    return new;
  end if;

  insert into public.admin_audit_log (
    actor_id, target_id, entity_type, action, details
  ) values (
    auth.uid(), event_target, tg_table_name, event_action, changed_fields
  );
  return new;
end;
$$;

revoke all on function public.capture_citizen_madani_admin_audit() from public, anon, authenticated;

drop trigger if exists employee_profiles_admin_audit on public.employee_profiles;
create trigger employee_profiles_admin_audit
  after update on public.employee_profiles
  for each row execute function public.capture_citizen_madani_admin_audit();

drop trigger if exists exchange_requests_admin_audit on public.exchange_requests;
create trigger exchange_requests_admin_audit
  after update on public.exchange_requests
  for each row execute function public.capture_citizen_madani_admin_audit();

drop trigger if exists announcements_admin_audit on public.announcements;
create trigger announcements_admin_audit
  after update on public.announcements
  for each row execute function public.capture_citizen_madani_admin_audit();
