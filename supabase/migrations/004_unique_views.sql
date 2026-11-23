-- Unique-viewer counting: one view per user per listing, incremented atomically.
create table if not exists listing_views (
  listing_id bigint not null references listings(id) on delete cascade,
  user_id bigint not null references users(tg_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);
alter table listing_views enable row level security;

create or replace function bump_view(p_listing bigint, p_user bigint) returns void
language plpgsql set search_path = public as $$
begin
  insert into listing_views (listing_id, user_id) values (p_listing, p_user) on conflict do nothing;
  if found then update listings set views = views + 1 where id = p_listing; end if;
end $$;
revoke execute on function bump_view(bigint, bigint) from public, anon, authenticated;
