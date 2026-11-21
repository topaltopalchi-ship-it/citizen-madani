-- Support up to five private attachments on a single direct message.
-- Legacy single-attachment columns remain populated from the first attachment.
alter table public.direct_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.direct_messages
  add constraint direct_messages_attachments_array_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);

drop function if exists public.delete_own_direct_message(uuid);

create function public.delete_own_direct_message(message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths jsonb;
begin
  if auth.uid() is null
     or not public.is_citizen_madani_active_employee() then
    raise exception 'Active employee authentication required';
  end if;

  select coalesce(
    case when jsonb_typeof(dm.attachments) = 'array' and jsonb_array_length(dm.attachments) > 0
      then (select jsonb_agg(value ->> 'path') from jsonb_array_elements(dm.attachments) where value ? 'path')
      else null
    end,
    case when dm.attachment_path is not null then jsonb_build_array(dm.attachment_path) else '[]'::jsonb end
  )
  into v_paths
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
      attachment_path = null, attachment_name = null, attachment_type = null,
      attachment_size = null, attachments = '[]'::jsonb, deleted_at = now()
  where id = message_id and sender_id = auth.uid() and deleted_at is null;

  return v_paths;
end;
$$;

revoke all on function public.delete_own_direct_message(uuid) from public, anon;
grant execute on function public.delete_own_direct_message(uuid) to authenticated;
