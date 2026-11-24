-- v6: category-specific attributes (cars: model, specs, transmission, fuel). Already applied to the live project.
alter table listings add column if not exists attrs jsonb not null default '{}'::jsonb;
create index if not exists listings_attrs_idx on listings using gin (attrs);
