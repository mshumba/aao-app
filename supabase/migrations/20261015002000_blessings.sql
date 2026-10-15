-- A blessing each time the app opens: lines Apostle Arome Osayi speaks over
-- people in his sermons, clean verbatim (his words from the captions with
-- capitalisation and punctuation, stutters and fillers removed), each with
-- the exact moment to play. Approved by the owner on 15 Oct 2026 ("Approve
-- the 125 blessings rated 5 and 4; drop the rated-3 ones and the
-- check-by-ear ones. Keep God's-voice lines and show Bible references").
-- The app reads published rows; nobody writes through the API.

create table public.blessings (
  id text primary key check (id ~ '^bl-[0-9]+-[0-9]+$'),
  text text not null check (char_length(text) between 8 and 400),
  scripture_ref text,
  theme text not null,
  kind text not null check (kind in ('blessing', 'declaration', 'scripture')),
  youtube_id text not null references public.sermons (youtube_id) on update cascade on delete cascade,
  passage_id bigint,
  play_from real not null check (play_from >= 0),
  quality smallint not null check (quality between 1 and 5),
  sort integer not null,
  status text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

create index blessings_published_sort_idx on public.blessings (sort) where status = 'published';

alter table public.blessings enable row level security;
revoke all on public.blessings from anon, authenticated;
grant select on public.blessings to anon, authenticated;
grant select, insert, update, delete on public.blessings to service_role;

create policy "Anyone reads published blessings"
  on public.blessings for select to anon, authenticated
  using (status = 'published');
