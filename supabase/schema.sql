-- Duboard schema. Run in Supabase SQL editor.
-- All access goes through the Node server with the service key; RLS is on with no policies (deny all for anon).

create table if not exists users (
  tg_id bigint primary key,
  username text,
  first_name text,
  lang text not null default 'ru' check (lang in ('ru','en')),
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists listings (
  id bigserial primary key,
  owner_id bigint not null references users(tg_id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) <= 2000),
  price numeric(12,2),            -- AED, null = free / negotiable
  category text not null,
  lang text not null check (lang in ('ru','en')),
  subcategory text,
  condition text check (condition in ('new','used')),
  brand text,
  year int check (year between 1950 and 2100),
  mileage int check (mileage >= 0),
  photos text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','sold','archived')),
  reject_reason text,
  views int not null default 0,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists listings_feed_idx on listings (status, approved_at desc);
create index if not exists listings_cat_idx on listings (category, status);
create index if not exists listings_owner_idx on listings (owner_id);
create index if not exists listings_search_idx on listings using gin (to_tsvector('simple', title || ' ' || description));

create table if not exists favorites (
  user_id bigint not null references users(tg_id) on delete cascade,
  listing_id bigint not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists reports (
  id bigserial primary key,
  listing_id bigint not null references listings(id) on delete cascade,
  reporter_id bigint not null references users(tg_id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);

alter table users enable row level security;
alter table listings enable row level security;
alter table favorites enable row level security;
alter table reports enable row level security;

-- Storage: create a PUBLIC bucket named "listings" in Supabase Storage (Dashboard -> Storage).
