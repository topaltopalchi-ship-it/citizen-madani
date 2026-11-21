-- Sender-only soft deletion for direct messages.
-- The attachment path is detached transactionally; the client then removes the
-- now-orphaned object through Supabase Storage's existing owner-only DELETE policy.
alter table public.direct_messages
  add column if not exists deleted_at timestamptz;

create index if not exists direct_messages_deleted_at_idx
  on public.direct_messages(deleted_at)
  where deleted_at is not null;

create or replace function public.delete_own_direct_message(message_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment_path text;
begin
  if auth.uid() is null
     or not public.is_citizen_madani_active_employee() then
    raise exception 'Active employee authentication required';
  end if;

  select dm.attachment_path
    into v_attachment_path
  from public.direct_messages dm
  where dm.id = message_id
    and dm.sender_id = auth.uid()
    and dm.deleted_at is null
  for update;

  if not found then
    raise exception 'Message not found or sender is not authorized';
  end if;

  update public.direct_messages
  set body = 'این پیام حذف شده است.',
      attachment_path = null,
      attachment_name = null,
      attachment_type = null,
      attachment_size = null,
      deleted_at = now()
  where id = message_id
    and sender_id = auth.uid()
    and deleted_at is null;

  return v_attachment_path;
end;
$$;

revoke all on function public.delete_own_direct_message(uuid) from public, anon;
grant execute on function public.delete_own_direct_message(uuid) to authenticated;
