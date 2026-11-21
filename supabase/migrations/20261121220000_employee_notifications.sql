-- Durable per-employee notifications generated only by trusted database triggers.
create table if not exists public.employee_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.employee_profiles(id) on delete cascade,
  notification_type text not null check (notification_type in ('direct_message', 'exchange_request', 'shift_swap', 'announcement')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 1000),
  target_page text not null check (target_page in ('پیام‌ها', 'درخواست‌های من', 'برنامه شیفت‌ها', 'اطلاعیه‌ها')),
  source_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists employee_notifications_recipient_created_idx
  on public.employee_notifications(recipient_id, created_at desc);
create index if not exists employee_notifications_unread_idx
  on public.employee_notifications(recipient_id, created_at desc)
  where read_at is null;

alter table public.employee_notifications enable row level security;
revoke all privileges on public.employee_notifications from public, anon, authenticated;
grant select on public.employee_notifications to authenticated;
grant update (read_at) on public.employee_notifications to authenticated;

drop policy if exists "Employees read own notifications" on public.employee_notifications;
create policy "Employees read own notifications"
  on public.employee_notifications for select to authenticated
  using (
    recipient_id = auth.uid()
    and public.is_citizen_madani_active_employee()
  );

drop policy if exists "Employees mark own notifications read" on public.employee_notifications;
create policy "Employees mark own notifications read"
  on public.employee_notifications for update to authenticated
  using (
    recipient_id = auth.uid()
    and public.is_citizen_madani_active_employee()
  )
  with check (
    recipient_id = auth.uid()
    and public.is_citizen_madani_active_employee()
  );

create or replace function public.create_citizen_madani_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  actor_name text;
  notice_title text;
  notice_body text;
  notice_type text;
  destination text;
  event_key text;
begin
  if tg_table_name = 'direct_messages' then
    recipient := new.recipient_id;
    select coalesce(nullif(display_name, ''), 'یکی از همکاران')
      into actor_name
      from public.employee_profiles
     where id = new.sender_id;
    notice_title := 'پیام خصوصی جدید';
    notice_body := coalesce(nullif(left(new.body, 220), ''), 'یک فایل برای شما ارسال شده است.');
    notice_type := 'direct_message';
    destination := 'پیام‌ها';
    event_key := 'direct_message:' || new.id::text;
    if not exists (
      select 1 from public.employee_profiles
       where id = recipient and is_active = true
    ) then
      return new;
    end if;
    notice_body := 'از طرف ' || coalesce(actor_name, 'یکی از همکاران') || ': ' || notice_body;
    insert into public.employee_notifications
      (recipient_id, notification_type, title, body, target_page, source_key)
    values (recipient, notice_type, notice_title, left(notice_body, 1000), destination, event_key)
    on conflict (source_key) do nothing;
    return new;
  elsif tg_table_name = 'exchange_requests' then
    if old.status is not distinct from new.status or new.status = 'pending' then
      return new;
    end if;
    recipient := new.employee_id;
    notice_title := case when new.status = 'approved'
      then 'درخواست تبادل شما تأیید شد' else 'درخواست تبادل شما رد شد' end;
    notice_body := new.request_type || ' · ' || new.from_unit || ' ← ' || new.to_unit;
    notice_type := 'exchange_request';
    destination := 'درخواست‌های من';
    event_key := 'exchange_request:' || new.id::text || ':' || new.status;
  elsif tg_table_name = 'shift_change_requests' then
    if old.status is not distinct from new.status or new.status = 'pending' then
      return new;
    end if;
    recipient := new.requester_id;
    notice_title := case when new.status = 'approved'
      then 'درخواست جابه‌جایی شیفت تأیید شد' else 'درخواست جابه‌جایی شیفت رد شد' end;
    notice_body := coalesce(nullif(new.note, ''), 'وضعیت درخواست جابه‌جایی شیفت شما تغییر کرد.');
    notice_type := 'shift_swap';
    destination := 'برنامه شیفت‌ها';
    event_key := 'shift_swap:' || new.id::text || ':' || new.status;
  elsif tg_table_name = 'announcements' then
    if old.is_published is not distinct from new.is_published or new.is_published = false then
      return new;
    end if;
    insert into public.employee_notifications
      (recipient_id, notification_type, title, body, target_page, source_key)
    select p.id, 'announcement', new.title, left(new.body, 1000), 'اطلاعیه‌ها',
           'announcement:' || new.id::text || ':' || p.id::text
      from public.employee_profiles p
     where p.is_active = true
       and p.id <> new.created_by
    on conflict (source_key) do nothing;
    return new;
  else
    return new;
  end if;

  insert into public.employee_notifications
    (recipient_id, notification_type, title, body, target_page, source_key)
  select recipient, notice_type, notice_title, left(notice_body, 1000), destination, event_key
   where exists (
     select 1 from public.employee_profiles
      where id = recipient and is_active = true
   )
  on conflict (source_key) do nothing;
  return new;
end;
$$;

revoke all on function public.create_citizen_madani_notification() from public, anon, authenticated;

drop trigger if exists direct_messages_create_notification on public.direct_messages;
create trigger direct_messages_create_notification
  after insert on public.direct_messages
  for each row execute function public.create_citizen_madani_notification();

drop trigger if exists exchange_requests_create_notification on public.exchange_requests;
create trigger exchange_requests_create_notification
  after update of status on public.exchange_requests
  for each row execute function public.create_citizen_madani_notification();

drop trigger if exists shift_change_requests_create_notification on public.shift_change_requests;
create trigger shift_change_requests_create_notification
  after update of status on public.shift_change_requests
  for each row execute function public.create_citizen_madani_notification();

drop trigger if exists announcements_create_notifications on public.announcements;
create trigger announcements_create_notifications
  after update of is_published on public.announcements
  for each row execute function public.create_citizen_madani_notification();

-- Realtime delivers inserts and read-state updates to the notification owner only.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'employee_notifications'
     ) then
    alter publication supabase_realtime add table public.employee_notifications;
  end if;
end
$$;
