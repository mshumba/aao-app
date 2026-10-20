-- Sermon cards: what Claude Sonnet 5.5 recorded after reading each sermon's
-- whole transcript (scripts/read-sermons.py, first run 20 Oct 2026: 2,769
-- sermons). The owner approved saving them and using their topics on 20 Oct
-- 2026 ("replace the live topic tags with the full-read topics at fit 4 or
-- higher ... and save the sermon cards to the database").
--
-- Topics now come from the cards: a sermon is tagged with its card's topic
-- when the card rates the fit 4 or 5. Against Argon's 136-sermon hand-check
-- that was right 96% of the time, against 91% for the earlier reader-plus-
-- embedding rule, and it tags about 1,670 sermons instead of 1,379. The tags
-- stay in public.sermon_topics (one row per sermon, rank 1) so the app reads
-- them as before; score is the fit plus a tenth of the embedding match (z,
-- clamped to +-5), so within a topic the squarest fits come first.
--
-- Everyone reads the cards (they describe public sermons); only the service
-- role writes them. scripts/read-sermons.py `save` fills both tables, and
-- replaces scripts/tag-topics.py.

create table public.sermon_cards (
  youtube_id text primary key
    references public.sermons (youtube_id) on update cascade on delete cascade,
  summary text not null check (char_length(summary) between 1 and 2000),
  main_points text[] not null default '{}',
  scriptures text[] not null default '{}',
  topic text references public.topics (id) on update cascade on delete set null,
  topic_fit smallint not null check (topic_fit between 1 and 5),
  also_topic text references public.topics (id) on update cascade on delete set null,
  for_whom text not null default '',
  kind text not null check (kind in ('sermon', 'teaching', 'prayer_meeting', 'worship', 'conference_session',
    'ministration', 'testimonies', 'other')),
  preacher text not null default '',
  -- Seconds into the video where the preaching itself starts and ends, read
  -- from the transcript's passage times; null when there's none or it runs on.
  preaching_start real check (preaching_start >= 0),
  preaching_end real check (preaching_end >= 0),
  language text not null default 'en',
  flags text[] not null default '{}',
  model text not null,
  read_at timestamptz not null default now()
);

create index sermon_cards_topic_idx on public.sermon_cards (topic) where topic_fit >= 4;

alter table public.sermon_cards enable row level security;

revoke all on public.sermon_cards from anon, authenticated;
grant select on public.sermon_cards to anon, authenticated, library_reader;
grant select, insert, update, delete on public.sermon_cards to service_role;

create policy "Anyone reads sermon cards"
  on public.sermon_cards for select to anon, authenticated
  using (true);

comment on table public.sermon_topics is
  'One main topic per sermon: its card''s topic when the fit is 4 or 5 (public.sermon_cards). Filled by scripts/read-sermons.py save.';
comment on column public.sermon_topics.score is
  'The card''s fit (4 or 5) plus a tenth of the embedding match (z, clamped to +-5). Higher is a squarer fit.';
