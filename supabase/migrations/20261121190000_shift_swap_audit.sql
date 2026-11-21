-- Include manager decisions on shift-swap requests in the immutable audit trail.
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_entity_type_check;

alter table public.admin_audit_log
  add constraint admin_audit_log_entity_type_check
  check (entity_type in (
    'employee_profiles',
    'exchange_requests',
    'announcements',
    'shift_change_requests'
  ));

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
  elsif tg_table_name = 'shift_change_requests' then
    if old.status is not distinct from new.status then
      return new;
    end if;
    changed_fields := jsonb_build_object(
      'status', new.status,
      'from_shift_id', new.from_shift_id,
      'to_shift_id', new.to_shift_id
    );
    event_action := case when new.status = 'approved'
      then 'shift_swap_approved'
      else 'shift_swap_rejected'
    end;
    event_target := new.requester_id;
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

drop trigger if exists shift_change_requests_admin_audit
  on public.shift_change_requests;

create trigger shift_change_requests_admin_audit
  after update of status on public.shift_change_requests
  for each row execute function public.capture_citizen_madani_admin_audit();
