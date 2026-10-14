-- AAO sermon catalogue: every long-form video on the Apostle Arome Osayi
-- YouTube channel (youtube.com/@ApostleAromeOsayi), so new sermons reach the
-- app without an app update. Rows are loaded by scripts/import-catalogue.ts,
-- which upserts on youtube_id and can be re-run at any time.
--
-- Everyone (guests included) reads the catalogue; nobody writes it through
-- the API. Grants are explicit because "Automatically expose new tables" is
-- off in this project.
--
-- youtube_id is the stable key: saved sermons, watch progress and (later)
-- transcript embeddings refer to it.

-- Series ----------------------------------------------------------------------
-- A multi-part teaching ("Gift of Prophecy") or a gathering over several days
-- ("Lioness Conference 2022"), read from the titles.

create table public.series (
  key text primary key
    check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(key) <= 160),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.series enable row level security;

revoke all on public.series from anon, authenticated;
grant select on public.series to anon, authenticated;
grant select, insert, update, delete on public.series to service_role;

create policy "Anyone reads series"
  on public.series for select to anon, authenticated
  using (true);

create trigger series_touch_updated_at
  before update on public.series
  for each row execute function public.touch_updated_at();

-- Sermons ---------------------------------------------------------------------

create table public.sermons (
  youtube_id text primary key check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  -- The exact YouTube title, never edited.
  title text not null check (char_length(title) between 1 and 300),
  -- Read from the title (src/catalogue/parseTitle.ts).
  headline text not null check (char_length(headline) between 1 and 300),
  event text,
  series_key text references public.series (key) on update cascade on delete set null,
  part smallint check (part > 0),
  -- Which part of the event: "Day 2 Evening", "Grand Finale", "Session 8".
  session text,
  -- Named preachers when it isn't Apostle Arome Osayi alone.
  speaker text,
  venue text,
  -- When it was preached, if the title says; often days before the upload.
  preached_on date,
  -- From YouTube.
  published_at timestamptz not null,
  duration_seconds integer check (duration_seconds >= 0),
  description text,
  thumbnail_url text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The app syncs what changed since its last copy, and lists newest first.
create index sermons_updated_at_idx on public.sermons (updated_at);
create index sermons_published_at_idx on public.sermons (published_at desc);
create index sermons_series_key_idx on public.sermons (series_key);

alter table public.sermons enable row level security;

revoke all on public.sermons from anon, authenticated;
grant select on public.sermons to anon, authenticated;
grant select, insert, update, delete on public.sermons to service_role;

create policy "Anyone reads sermons"
  on public.sermons for select to anon, authenticated
  using (true);

create trigger sermons_touch_updated_at
  before update on public.sermons
  for each row execute function public.touch_updated_at();
