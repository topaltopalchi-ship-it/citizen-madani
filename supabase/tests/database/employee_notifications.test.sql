begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

do $setup$
declare
  publisher_id uuid := '00000000-0000-0000-0000-000000000031';
  sender_id uuid := '00000000-0000-0000-0000-000000000032';
  recipient_id uuid := '00000000-0000-0000-0000-000000000033';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (publisher_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'notification-publisher@citizen-madani.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (sender_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'notification-sender@citizen-madani.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (recipient_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'notification-recipient@citizen-madani.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.direct_messages (id, sender_id, recipient_id, body)
  values (
    '00000000-0000-0000-0000-000000000041',
    sender_id,
    recipient_id,
    'پیام آزمایشی اعلان'
  );

  insert into public.announcements (
    id, title, body, priority, is_published, created_by
  ) values (
    '00000000-0000-0000-0000-000000000051',
    'اطلاعیه آزمایشی',
    'متن آزمایش اعلان همگانی',
    'normal',
    false,
    publisher_id
  );

  update public.announcements
     set is_published = true, published_at = now()
   where id = '00000000-0000-0000-0000-000000000051';
end;
$setup$;

select is(
  (select count(*)::integer from public.employee_notifications
   where source_key = 'direct_message:00000000-0000-0000-0000-000000000041'),
  1,
  'a new private message creates exactly one durable notification'
);

select is(
  (select target_page from public.employee_notifications
   where source_key = 'direct_message:00000000-0000-0000-0000-000000000041'),
  'پیام‌ها',
  'private message notification links to the private inbox'
);

select is(
  (select count(*)::integer from public.employee_notifications
   where notification_type = 'announcement'
     and source_key like 'announcement:00000000-0000-0000-0000-000000000051:%'),
  2,
  'publishing an announcement notifies every other active employee'
);

select is(
  (select count(*)::integer from public.employee_notifications
   where recipient_id = '00000000-0000-0000-0000-000000000031'
     and notification_type = 'announcement'),
  0,
  'announcement publisher does not receive a duplicate self-notification'
);

select ok(
  (select coalesce(proconfig @> array['search_path=""'], false)
   from pg_proc
   where oid = 'public.create_citizen_madani_notification()'::regprocedure),
  'notification trigger pins an empty search_path'
);

select ok(
  has_column_privilege('authenticated', 'public.employee_notifications', 'read_at', 'UPDATE'),
  'authenticated employees can update only the read-state column'
);

select ok(
  not has_table_privilege('authenticated', 'public.employee_notifications', 'INSERT')
  and not has_table_privilege('authenticated', 'public.employee_notifications', 'DELETE'),
  'authenticated employees cannot create or delete notification records directly'
);

select * from finish();
rollback;
