-- Independent employee shift roster and manager-approved shift swaps.
create table if not exists public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_profiles(id) on delete restrict,
  shift_date date not null,
  shift_type text not null check (shift_type in ('morning', 'evening', 'night')),
  starts_at time not null,
  ends_at time not null,
  department text not null check (char_length(department) between 1 and 100),
  notes text,
  created_by uuid not null references public.employee_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint work_shift_time_valid check (starts_at <> ends_at),
  constraint work_shift_employee_slot_unique unique (employee_id, shift_date, shift_type)
);

create index if not exists work_shifts_date_department_idx
  on public.work_shifts(shift_date, department, shift_type);
create index if not exists work_shifts_employee_date_idx
  on public.work_shifts(employee_id, shift_date);

alter table public.work_shifts enable row level security;
revoke all privileges on public.work_shifts from public, anon, authenticated;
grant select on public.work_shifts to authenticated;
grant insert (employee_id, shift_date, shift_type, starts_at, ends_at, department, notes, created_by)
  on public.work_shifts to authenticated;
grant update (employee_id, shift_date, shift_type, starts_at, ends_at, department, notes)
  on public.work_shifts to authenticated;
grant delete on public.work_shifts to authenticated;

drop policy if exists "Active employees read shift roster" on public.work_shifts;
create policy "Active employees read shift roster"
  on public.work_shifts for select to authenticated
  using (public.is_citizen_madani_active_employee());

drop policy if exists "Admins create shifts" on public.work_shifts;
create policy "Admins create shifts"
  on public.work_shifts for insert to authenticated
  with check (
    public.is_citizen_madani_admin()
    and created_by = auth.uid()
    and exists (
      select 1 from public.employee_profiles p
      where p.id = employee_id and p.is_active = true
    )
  );

drop policy if exists "Admins update shifts" on public.work_shifts;
create policy "Admins update shifts"
  on public.work_shifts for update to authenticated
  using (public.is_citizen_madani_admin())
  with check (
    public.is_citizen_madani_admin()
    and exists (
      select 1 from public.employee_profiles p
      where p.id = employee_id and p.is_active = true
    )
  );

drop policy if exists "Admins delete shifts" on public.work_shifts;
create policy "Admins delete shifts"
  on public.work_shifts for delete to authenticated
  using (public.is_citizen_madani_admin());

create table if not exists public.shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.employee_profiles(id) on delete restrict,
  from_shift_id uuid not null references public.work_shifts(id) on delete restrict,
  to_shift_id uuid not null references public.work_shifts(id) on delete restrict,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.employee_profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shift_swap_distinct_slots check (from_shift_id <> to_shift_id),
  constraint shift_swap_review_state check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists shift_change_requests_requester_idx
  on public.shift_change_requests(requester_id, created_at desc);
create index if not exists shift_change_requests_status_idx
  on public.shift_change_requests(status, created_at desc);
create unique index if not exists shift_change_one_pending_per_source_idx
  on public.shift_change_requests(requester_id, from_shift_id)
  where status = 'pending';

alter table public.shift_change_requests enable row level security;
revoke all privileges on public.shift_change_requests from public, anon, authenticated;
grant select, insert on public.shift_change_requests to authenticated;
grant update (status) on public.shift_change_requests to authenticated;

drop policy if exists "Employees and admins read shift change requests" on public.shift_change_requests;
create policy "Employees and admins read shift change requests"
  on public.shift_change_requests for select to authenticated
  using (requester_id = auth.uid() or public.is_citizen_madani_admin());

drop policy if exists "Active employees request shift swaps" on public.shift_change_requests;
create policy "Active employees request shift swaps"
  on public.shift_change_requests for insert to authenticated
  with check (
    public.is_citizen_madani_active_employee()
    and requester_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.work_shifts source_shift
      where source_shift.id = from_shift_id
        and source_shift.employee_id = auth.uid()
        and source_shift.shift_date >= current_date
    )
    and exists (
      select 1 from public.work_shifts target_shift
      join public.employee_profiles target_employee on target_employee.id = target_shift.employee_id
      where target_shift.id = to_shift_id
        and target_shift.employee_id <> auth.uid()
        and target_shift.shift_date >= current_date
        and target_employee.is_active = true
    )
  );

drop policy if exists "Admins review shift swaps" on public.shift_change_requests;
create policy "Admins review shift swaps"
  on public.shift_change_requests for update to authenticated
  using (public.is_citizen_madani_admin() and status = 'pending')
  with check (public.is_citizen_madani_admin() and status in ('approved', 'rejected'));

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
    select employee_id, shift_date into source_employee, source_date
      from public.work_shifts where id = new.from_shift_id for update;
    select employee_id, shift_date into target_employee, target_date
      from public.work_shifts where id = new.to_shift_id for update;

    if source_employee is distinct from new.requester_id
       or target_employee is null
       or target_employee = new.requester_id
       or source_date < current_date
       or target_date < current_date then
      raise exception 'Shift assignments changed or are no longer eligible';
    end if;

    if not exists (select 1 from public.employee_profiles p where p.id = source_employee and p.is_active = true)
       or not exists (select 1 from public.employee_profiles p where p.id = target_employee and p.is_active = true) then
      raise exception 'Both employees must be active';
    end if;

    update public.work_shifts set employee_id = target_employee where id = new.from_shift_id;
    update public.work_shifts set employee_id = source_employee where id = new.to_shift_id;
  end if;
  return new;
end;
$$;

revoke all on function public.apply_citizen_madani_shift_swap() from public, anon, authenticated;
drop trigger if exists shift_change_apply_swap on public.shift_change_requests;
create trigger shift_change_apply_swap
  before update of status on public.shift_change_requests
  for each row execute function public.apply_citizen_madani_shift_swap();
