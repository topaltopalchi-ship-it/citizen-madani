-- Keep private message files inaccessible after an employee account is deactivated.
-- Storage policies must enforce the same active-account gate as direct_messages RLS.

drop policy if exists "Message participants read attachments" on storage.objects;
create policy "Message participants read attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-message-attachments'
    and public.is_citizen_madani_active_employee()
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
    and public.is_citizen_madani_active_employee()
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
