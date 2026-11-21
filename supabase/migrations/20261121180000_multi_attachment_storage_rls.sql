-- Enforce ownership and participant access for every attachment in a message.
-- The legacy attachment_path column remains supported for older one-file messages.

create or replace function public.owns_employee_message_attachments(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_attachments jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_path text;
  v_name text;
  v_type text;
  v_size_text text;
  v_size bigint;
  v_total_size bigint := 0;
begin
  if auth.uid() is null
     or p_sender_id <> auth.uid()
     or p_recipient_id = auth.uid()
     or p_attachments is null
     or jsonb_typeof(p_attachments) <> 'array'
     or jsonb_array_length(p_attachments) > 5 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_attachments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      return false;
    end if;

    v_path := v_item ->> 'path';
    v_name := v_item ->> 'name';
    v_type := v_item ->> 'type';
    v_size_text := v_item ->> 'size';

    if v_path is null
       or v_name is null
       or char_length(v_name) not between 1 and 255
       or v_type not in (
         'image/jpeg','image/png','image/webp','image/gif','application/pdf',
         'text/plain',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       )
       or v_size_text is null
       or v_size_text !~ '^[0-9]{1,10}$' then
      return false;
    end if;

    v_size := v_size_text::bigint;
    v_total_size := v_total_size + v_size;
    if v_size not between 1 and 10485760
       or v_total_size > 10485760
       or v_path not like p_sender_id::text || '/' || p_recipient_id::text || '/%' then
      return false;
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'employee-message-attachments'
        and o.name = v_path
        and o.owner_id = auth.uid()::text
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.owns_employee_message_attachments(uuid, uuid, jsonb) from public, anon;
grant execute on function public.owns_employee_message_attachments(uuid, uuid, jsonb) to authenticated;

drop policy if exists "Message participants read attachments" on storage.objects;
create policy "Message participants read attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-message-attachments'
    and exists (
      select 1
      from public.direct_messages dm
      where (dm.sender_id = auth.uid() or dm.recipient_id = auth.uid())
        and (
          dm.attachment_path = storage.objects.name
          or exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(dm.attachments) = 'array'
                then dm.attachments else '[]'::jsonb end
            ) attachment
            where attachment.value ->> 'path' = storage.objects.name
          )
        )
    )
  );

drop policy if exists "Message sender deletes own orphan attachments" on storage.objects;
create policy "Message sender deletes own orphan attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1
      from public.direct_messages dm
      where dm.attachment_path = storage.objects.name
         or exists (
           select 1
           from jsonb_array_elements(
             case when jsonb_typeof(dm.attachments) = 'array'
               then dm.attachments else '[]'::jsonb end
           ) attachment
           where attachment.value ->> 'path' = storage.objects.name
         )
    )
  );

drop policy if exists "Employees send direct messages" on public.direct_messages;
create policy "Employees send direct messages"
  on public.direct_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and exists (
      select 1 from public.employee_profiles p
      where p.id = sender_id and p.is_active = true
    )
    and exists (
      select 1 from public.employee_profiles p
      where p.id = recipient_id and p.is_active = true
    )
    and (
      attachment_path is null
      or (
        (storage.foldername(attachment_path))[1] = sender_id::text
        and (storage.foldername(attachment_path))[2] = recipient_id::text
        and public.owns_employee_message_attachment(attachment_path)
      )
    )
    and public.owns_employee_message_attachments(sender_id, recipient_id, attachments)
  );
