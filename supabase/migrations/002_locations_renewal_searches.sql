-- For databases created before v5. (Already applied to the live project; keep for other environments.)
alter table listings add column if not exists emirate text;
alter table listings add column if not exists area text;
alter table listings add column if not exists renewed_at timestamptz;
alter table listings add column if not exists reminded_at timestamptz;
update listings set renewed_at = coalesce(approved_at, created_at) where renewed_at is null;
create index if not exists listings_loc_idx on listings (emirate, area, status);
create index if not exists listings_renew_idx on listings (status, renewed_at);

create table if not exists saved_searches (
  id bigserial primary key,
  user_id bigint not null references users(tg_id) on delete cascade,
  params jsonb not null,
  sig text not null,
  created_at timestamptz not null default now(),
  unique (user_id, sig)
);
alter table saved_searches enable row level security;
