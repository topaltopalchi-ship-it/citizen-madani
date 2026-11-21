-- Employee welfare partners and verified staff benefits.
create table if not exists public.welfare_partners (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.employee_profiles(id),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  category text not null check (category in ('sports', 'shopping', 'food', 'health', 'travel', 'education', 'services', 'other')),
  benefit_type text not null default 'other' check (benefit_type in ('discount', 'installment', 'special_price', 'other')),
  description text not null check (char_length(btrim(description)) between 5 and 3000),
  discount_percent numeric(5,2) check (discount_percent is null or discount_percent between 0 and 100),
  installment_terms text check (installment_terms is null or char_length(installment_terms) <= 1000),
  offer_details text check (offer_details is null or char_length(offer_details) <= 1500),
  address text check (address is null or char_length(address) <= 500),
  city text check (city is null or char_length(city) <= 100),
  phone text check (phone is null or char_length(phone) <= 40),
  website_url text check (website_url is null or website_url ~ '^https?://'),
  usage_instructions text check (usage_instructions is null or char_length(usage_instructions) <= 1500),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (benefit_type <> 'discount' or discount_percent is not null),
  check (benefit_type <> 'installment' or installment_terms is not null),
  check ((status = 'published' and published_at is not null) or status <> 'published')
);

create index if not exists welfare_partners_public_feed_idx
  on public.welfare_partners(category, published_at desc)
  where status = 'published';
create index if not exists welfare_partners_validity_idx
  on public.welfare_partners(ends_at)
  where status = 'published';

alter table public.welfare_partners enable row level security;
revoke all privileges on public.welfare_partners from public, anon, authenticated;
grant select, insert, update on public.welfare_partners to authenticated;

drop policy if exists "Active employees read current welfare offers" on public.welfare_partners;
create policy "Active employees read current welfare offers"
  on public.welfare_partners for select to authenticated
  using (
    public.is_citizen_madani_active_employee()
    and status = 'published'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

drop policy if exists "Admins manage welfare partners" on public.welfare_partners;
create policy "Admins manage welfare partners"
  on public.welfare_partners for all to authenticated
  using (public.is_citizen_madani_admin())
  with check (public.is_citizen_madani_admin() and created_by = auth.uid());

comment on table public.welfare_partners is
  'Verified welfare and discount agreements available to active Citizen Madani employees.';
