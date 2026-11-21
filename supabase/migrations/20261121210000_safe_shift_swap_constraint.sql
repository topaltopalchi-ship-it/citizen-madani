-- Make two-person shift swaps atomic even when both shifts occupy the
-- same date/type slot, and acquire row locks in a stable order.

alter table public.work_shifts
  alter constraint work_shift_employee_slot_unique
  deferrable initially immediate;

create or replace function public.apply_citizen_madani_shift_swap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_employee uuid;
  target_employee uuid;
  source_date date;
  target_date date;
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    raise exception 'Only pending shift requests can be reviewed';
  end if;

  if not public.is_citizen_madani_admin() then
    raise exception 'Only an active administrator can review shift requests';
  end if;

  new.reviewed_by := auth.uid();
  new.reviewed_at := now();

  if new.status = 'approved' then
    -- Qualify the constraint because this SECURITY DEFINER function has an
    -- intentionally empty search_path.
    set constraints public.work_shift_employee_slot_unique deferred;

    -- Stable lock ordering prevents reciprocal swap requests from deadlocking.
    perform 1
      from public.work_shifts
      where id in (new.from_shift_id, new.to_shift_id)
      order by id
      for update;

    select employee_id, shift_date
      into source_employee, source_date
      from public.work_shifts
      where id = new.from_shift_id;

    select employee_id, shift_date
      into target_employee, target_date
      from public.work_shifts
      where id = new.to_shift_id;

    if source_employee is distinct from new.requester_id
       or target_employee is null
       or target_employee = new.requester_id
       or source_date < current_date
       or target_date < current_date then
      raise exception 'Shift assignments changed or are no longer eligible';
    end if;

    if not exists (
      select 1 from public.employee_profiles p
      where p.id = source_employee and p.is_active = true
    ) or not exists (
      select 1 from public.employee_profiles p
      where p.id = target_employee and p.is_active = true
    ) then
      raise exception 'Both employees must be active';
    end if;

    update public.work_shifts
      set employee_id = case
        when id = new.from_shift_id then target_employee
        when id = new.to_shift_id then source_employee
      end
      where id in (new.from_shift_id, new.to_shift_id);
  end if;

  return new;
end;
$$;
