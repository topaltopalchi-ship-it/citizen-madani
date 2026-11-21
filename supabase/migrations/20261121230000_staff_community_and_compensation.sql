-- Staff community listings and official compensation updates.
create table if not exists public.community_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.employee_profiles(id) on delete cascade,
  listing_type text not null check (listing_type in ('advertisement', 'used_item', 'department_transfer', 'marketplace')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 5 and 3000),
  category text not null default 'عمومی' check (char_length(category) between 1 and 80),
  price_toman numeric(14,0) check (price_toman is null or price_toman >= 0),
  item_condition text check (item_condition is null or item_condition in ('new', 'used', 'like_new')),
  current_department text check (current_department is null or char_length(current_department) <= 100),
  desired_department text check (desired_department is null or char_length(desired_department) <= 100),
  preferred_shift text check (preferred_shift is null or preferred_shift in ('morning', 'evening', 'night', 'any')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'closed')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (listing_type <> 'department_transfer' or (current_department is not null and desired_department is not null and current_department <> desired_department)),
  check (listing_type = 'department_transfer' or (current_department is null and desired_department is null and preferred_shift is null))
);

create index if not exists community_listings_public_feed_idx
  on public.community_listings(listing_type, created_at desc)
  where status = 'approved';
create index if not exists community_listings_owner_idx
  on public.community_listings(owner_id, created_at desc);

alter table public.community_listings enable row level security;
revoke all privileges on public.community_listings from public, anon, authenticated;
grant select, insert, update on public.community_listings to authenticated;

drop policy if exists "Active employees read approved listings and own submissions" on public.community_listings;
create policy "Active employees read approved listings and own submissions"
  on public.community_listings for select to authenticated
  using (
    public.is_citizen_madani_active_employee()
    and (status = 'approved' or owner_id = auth.uid() or public.is_citizen_madani_admin())
  );

drop policy if exists "Active employees submit own listings for review" on public.community_listings;
create policy "Active employees submit own listings for review"
  on public.community_listings for insert to authenticated
  with check (
    owner_id = auth.uid()
    and status = 'pending'
    and public.is_citizen_madani_active_employee()
  );

drop policy if exists "Owners edit pending or close own listings" on public.community_listings;
create policy "Owners edit pending or close own listings"
  on public.community_listings for update to authenticated
  using (owner_id = auth.uid() and public.is_citizen_madani_active_employee())
  with check (
    owner_id = auth.uid()
    and public.is_citizen_madani_active_employee()
    and status in ('pending', 'closed')
  );

drop policy if exists "Admins moderate all community listings" on public.community_listings;
create policy "Admins moderate all community listings"
  on public.community_listings for update to authenticated
  using (public.is_citizen_madani_admin())
  with check (public.is_citizen_madani_admin());

create table if not exists public.compensation_updates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.employee_profiles(id),
  update_type text not null check (update_type in ('salary', 'karaneh', 'overtime', 'benefits', 'other')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 5 and 4000),
  related_month text check (related_month is null or related_month ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'published' and published_at is not null) or status = 'draft')
);

create index if not exists compensation_updates_feed_idx
  on public.compensation_updates(published_at desc)
  where status = 'published';

alter table public.compensation_updates enable row level security;
revoke all privileges on public.compensation_updates from public, anon, authenticated;
grant select, insert, update on public.compensation_updates to authenticated;

drop policy if exists "Active employees read published compensation updates" on public.compensation_updates;
create policy "Active employees read published compensation updates"
  on public.compensation_updates for select to authenticated
  using (status = 'published' and public.is_citizen_madani_active_employee());

drop policy if exists "Admins manage compensation updates" on public.compensation_updates;
create policy "Admins manage compensation updates"
  on public.compensation_updates for all to authenticated
  using (public.is_citizen_madani_admin())
  with check (public.is_citizen_madani_admin() and created_by = auth.uid());

-- The staff author is the authenticated user; only administrators can publish.
