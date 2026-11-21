-- Private one-to-one employee messages.
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.employee_profiles(id) on delete restrict,
  recipient_id uuid not null references public.employee_profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_message_distinct_users check (sender_id <> recipient_id)
);

create index if not exists direct_messages_sender_created_idx
  on public.direct_messages(sender_id, created_at desc);
create index if not exists direct_messages_recipient_created_idx
  on public.direct_messages(recipient_id, created_at desc);
create index if not exists direct_messages_unread_idx
  on public.direct_messages(recipient_id, read_at)
  where read_at is null;

alter table public.direct_messages enable row level security;

drop policy if exists "Participants read direct messages" on public.direct_messages;
create policy "Participants read direct messages"
  on public.direct_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Employees send direct messages" on public.direct_messages;
create policy "Employees send direct messages"
  on public.direct_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and exists (
      select 1 from public.employee_profiles p
      where p.id = recipient_id and p.is_active = true
    )
    and exists (
      select 1 from public.employee_profiles p
      where p.id = sender_id and p.is_active = true
    )
  );

drop policy if exists "Recipients mark messages read" on public.direct_messages;
create policy "Recipients mark messages read"
  on public.direct_messages for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

grant select, insert on public.direct_messages to authenticated;
revoke update on public.direct_messages from authenticated;
grant update (read_at) on public.direct_messages to authenticated;
