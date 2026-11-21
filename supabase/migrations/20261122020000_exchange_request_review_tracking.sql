-- Add a durable administrator decision record to employee exchange requests.
alter table public.exchange_requests
  add column if not exists reviewed_by uuid references public.employee_profiles(id) on delete set null,
  add column if not exists review_note text;

alter table public.exchange_requests
  drop constraint if exists exchange_requests_review_note_length;
alter table public.exchange_requests
  add constraint exchange_requests_review_note_length
  check (review_note is null or char_length(review_note) <= 1000);

-- Only active administrators can record a decision and its author.
drop policy if exists "Admins review exchange requests" on public.exchange_requests;
create policy "Admins review exchange requests"
  on public.exchange_requests for update to authenticated
  using (public.is_citizen_madani_admin())
  with check (
    public.is_citizen_madani_admin()
    and status in ('approved', 'rejected')
    and reviewed_by = auth.uid()
    and reviewed_at is not null
  );

grant update (status, reviewed_at, reviewed_by, review_note)
  on public.exchange_requests to authenticated;

create index if not exists exchange_requests_reviewed_at_idx
  on public.exchange_requests(reviewed_at desc)
  where reviewed_at is not null;
