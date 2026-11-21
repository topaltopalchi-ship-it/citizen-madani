begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- Exercise the real auth.users trigger, manager authorization, request trigger,
-- deferred unique constraint, and two-row atomic assignment swap.
do $setup$
declare
  manager_id uuid := '00000000-0000-0000-0000-000000000001';
  employee_a uuid := '00000000-0000-0000-0000-000000000002';
  employee_b uuid := '00000000-0000-0000-0000-000000000003';
  shift_a uuid := '00000000-0000-0000-0000-000000000011';
  shift_b uuid := '00000000-0000-0000-0000-000000000012';
  request_id uuid := '00000000-0000-0000-0000-000000000021';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'integration-manager@citizen-madani.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (employee_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'integration-a@citizen-madani.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (employee_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'integration-b@citizen-madani.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  update public.employee_profiles
    set role = 'admin'
    where id = manager_id;

  insert into public.work_shifts (
    id, employee_id, shift_date, shift_type, starts_at, ends_at, department, created_by
  ) values
    (shift_a, employee_a, current_date + 14, 'morning', '07:00', '14:00', 'آزمایش', manager_id),
    (shift_b, employee_b, current_date + 14, 'morning', '07:00', '14:00', 'آزمایش', manager_id);

  insert into public.shift_change_requests (
    id, requester_id, from_shift_id, to_shift_id, note
  ) values (request_id, employee_a, shift_a, shift_b, 'integration test');

  perform set_config('request.jwt.claim.sub', manager_id::text, true);

  update public.shift_change_requests
    set status = 'approved'
    where id = request_id;
end;
$setup$;

select ok(
  (select condeferrable
   from pg_constraint
   where conrelid = 'public.work_shifts'::regclass
     and conname = 'work_shift_employee_slot_unique'),
  'same-employee/date/type uniqueness is deferrable'
);

select ok(
  (select coalesce(proconfig @> array['search_path=""'], false)
   from pg_proc
   where oid = 'public.apply_citizen_madani_shift_swap()'::regprocedure),
  'SECURITY DEFINER shift trigger pins an empty search_path'
);

select is(
  (select employee_id::text
   from public.work_shifts
   where id = '00000000-0000-0000-0000-000000000011'),
  '00000000-0000-0000-0000-000000000003',
  'source shift is assigned to the target employee after approval'
);

select is(
  (select employee_id::text
   from public.work_shifts
   where id = '00000000-0000-0000-0000-000000000012'),
  '00000000-0000-0000-0000-000000000002',
  'target shift is assigned to the requester after approval'
);

select is(
  (select status
   from public.shift_change_requests
   where id = '00000000-0000-0000-0000-000000000021'),
  'approved',
  'manager approval is persisted'
);

select is(
  (select reviewed_by::text
   from public.shift_change_requests
   where id = '00000000-0000-0000-0000-000000000021'),
  '00000000-0000-0000-0000-000000000001',
  'review actor is recorded from the authenticated manager'
);

select * from finish();
rollback;
