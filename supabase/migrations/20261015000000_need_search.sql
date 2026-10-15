-- Need-based search: sermon passages with meaning fingerprints, the
-- "What are you going through?" needs, curated moments, and the caches and
-- rate limit the search Edge Function uses.
--
-- Same rules as the earlier migrations: row level security on every table and
-- explicit grants (automatic exposure is off). The app reads needs and moments
-- directly; everything else is reached only through the Edge Functions, which
-- use the service role.
--
-- Passages come from the transcript pipeline (curated-sermons/pipelines/embeddings):
-- about 2.5 minutes of a sermon's YouTube captions each, embedded with OpenAI
-- text-embedding-3-large at dimensions=768 and stored at half precision.
-- Queries must be embedded the same way (model text-embedding-3-large,
-- dimensions 768). The HNSW index is created by the next migration, after the
-- bulk load (20261015000300_passages_hnsw.sql).

create extension if not exists vector with schema extensions;

-- Passages --------------------------------------------------------------------

create table public.passages (
  id bigint primary key,
  -- A sermon leaving the catalogue takes its passages (and their moments) with it.
  youtube_id text not null
    references public.sermons (youtube_id) on update cascade on delete cascade,
  start_s real not null check (start_s >= 0),
  end_s real not null check (end_s >= start_s),
  -- The auto-caption words as YouTube gave them (older uploads are lowercase
  -- without punctuation), joined by single spaces.
  text text not null,
  words integer not null check (words > 0),
  -- Share of repeated word trigrams: chants and songs score high, teaching low.
  rep real not null default 0 check (rep between 0 and 1),
  embedding extensions.halfvec(768) not null,
  fts tsvector generated always as (to_tsvector('english'::regconfig, text)) stored,
  -- Set when this moment is a near-copy of a passage in another upload (a
  -- sermon-only cut, a re-upload). Points at the kept copy; search skips it.
  dup_of bigint references public.passages (id) on delete set null,
  -- Passages that share much of this one's wording: in other uploads (the same
  -- service cut differently, a message preached again) or replayed later in the
  -- same upload. Search shows only the best-scoring copy among twins.
  twins bigint[] not null default '{}',
  -- Caption timing: seg_words[i] is the passage word index (0-based, in
  -- text split on spaces) where a caption line starts at seg_times[i] seconds.
  seg_words integer[] not null default '{}',
  seg_times real[] not null default '{}',
  check (cardinality(seg_words) = cardinality(seg_times)),
  check (dup_of is null or dup_of <> id)
);

create index passages_youtube_idx on public.passages (youtube_id, start_s);
create index passages_dup_of_idx on public.passages (dup_of) where dup_of is not null;

alter table public.passages enable row level security;

revoke all on public.passages from anon, authenticated;
grant select, insert, update, delete on public.passages to service_role;

-- Verbatim quotes ---------------------------------------------------------------
-- The transcripts are YouTube auto-captions. A quote shown in the app must be a
-- contiguous run of a passage's caption words: only capitalisation and
-- punctuation may be added. Both sides are reduced to lowercase words
-- (apostrophes dropped, any other non-alphanumeric character a word break) and
-- the quote must appear in the passage on word boundaries. Triggers below reject
-- any moment or cached quote that fails.

create function public.verbatim_words(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
           pg_catalog.translate(pg_catalog.lower(coalesce(t, '')), '''’‘`', ''),
           '[^a-z0-9]+', ' ', 'g'))
$$;

create function public.is_verbatim(quote text, passage_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.verbatim_words(quote) <> ''
     and pg_catalog.strpos(' ' || public.verbatim_words(passage_text) || ' ',
                           ' ' || public.verbatim_words(quote) || ' ') > 0
$$;

revoke execute on function public.verbatim_words(text) from public, anon, authenticated;
revoke execute on function public.is_verbatim(text, text) from public, anon, authenticated;
grant execute on function public.verbatim_words(text) to service_role;
grant execute on function public.is_verbatim(text, text) to service_role;

-- Needs -----------------------------------------------------------------------
-- The "What are you going through?" chips. Drafts stay hidden until published.

create table public.needs (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 64),
  label text not null check (char_length(label) between 1 and 120),
  short text not null check (char_length(short) between 1 and 40),
  theme text not null check (char_length(theme) between 1 and 120),
  sort integer not null default 0,
  published boolean not null default false
);

alter table public.needs enable row level security;

revoke all on public.needs from anon, authenticated;
grant select on public.needs to anon, authenticated;
grant select, insert, update, delete on public.needs to service_role;

create policy "Anyone reads published needs"
  on public.needs for select to anon, authenticated
  using (published);

-- Moments ---------------------------------------------------------------------
-- Curated moments: a quote inside a passage, with where to start playing.

create table public.moments (
  id bigint generated always as identity primary key,
  youtube_id text not null
    references public.sermons (youtube_id) on update cascade on delete cascade,
  passage_id bigint not null references public.passages (id) on delete cascade,
  need_id text references public.needs (id) on delete set null,
  -- Where to start playing (about 3 seconds before the quote) and stop.
  at_s real not null check (at_s >= 0),
  end_s real not null check (end_s >= at_s),
  title text not null check (char_length(title) between 1 and 80),
  -- A contiguous, verbatim span of the passage's caption words; only
  -- capitalisation and punctuation are added.
  quote text not null check (char_length(quote) between 1 and 600),
  score real,
  created_at timestamptz not null default now()
);

create index moments_need_idx on public.moments (need_id, score desc);
create index moments_youtube_idx on public.moments (youtube_id, at_s);
create index moments_passage_idx on public.moments (passage_id);

-- A moment's quote must be verbatim from its passage, and the passage must
-- belong to the moment's sermon.
create function public.moments_check_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p_text text;
  p_youtube text;
begin
  select p.text, p.youtube_id into p_text, p_youtube
  from public.passages p where p.id = new.passage_id;
  if p_youtube is distinct from new.youtube_id then
    raise exception 'moment passage % is not in sermon %', new.passage_id, new.youtube_id
      using errcode = '23514';
  end if;
  if not public.is_verbatim(new.quote, p_text) then
    raise exception 'moment quote is not verbatim from passage %', new.passage_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger moments_check_quote
  before insert or update of quote, passage_id, youtube_id on public.moments
  for each row execute function public.moments_check_quote();

alter table public.moments enable row level security;

revoke all on public.moments from anon, authenticated;
grant select on public.moments to anon, authenticated;
grant select, insert, update, delete on public.moments to service_role;

create policy "Anyone reads moments"
  on public.moments for select to anon, authenticated
  using (true);

-- Quote cache (Edge Function "quotes") -----------------------------------------
-- One verbatim quote per passage, or null when none passed the check, so a
-- passage is sent to the model at most once.

create table public.passage_quotes (
  passage_id bigint primary key references public.passages (id) on delete cascade,
  quote text check (char_length(quote) <= 600),
  quote_at real check (quote_at >= 0),
  model text not null,
  created_at timestamptz not null default now()
);

create function public.passage_quotes_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quote is not null and not public.is_verbatim(
       new.quote, (select p.text from public.passages p where p.id = new.passage_id)) then
    raise exception 'cached quote is not verbatim from passage %', new.passage_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger passage_quotes_check
  before insert or update of quote, passage_id on public.passage_quotes
  for each row execute function public.passage_quotes_check();

alter table public.passage_quotes enable row level security;

revoke all on public.passage_quotes from anon, authenticated;
grant select, insert, update, delete on public.passage_quotes to service_role;

-- Search cache and rate limit (Edge Function "search") --------------------------

create table public.search_cache (
  key text primary key check (char_length(key) <= 256),
  response jsonb not null,
  created_at timestamptz not null default now()
);

create index search_cache_created_idx on public.search_cache (created_at);

alter table public.search_cache enable row level security;

revoke all on public.search_cache from anon, authenticated;
grant select, insert, update, delete on public.search_cache to service_role;

create table public.search_hits (
  key text not null check (char_length(key) <= 256),
  at timestamptz not null default now()
);

create index search_hits_key_at_idx on public.search_hits (key, at);

alter table public.search_hits enable row level security;

revoke all on public.search_hits from anon, authenticated;
grant select, insert, delete on public.search_hits to service_role;

-- True (and counts the hit) while `key` has made fewer than max_hits calls in
-- the last window_seconds; false once the limit is reached.
create function public.search_rate_ok(key text, max_hits integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if key is null or max_hits is null or window_seconds is null
     or max_hits < 1 or window_seconds < 1 then
    raise exception 'search_rate_ok: bad arguments' using errcode = '22023';
  end if;
  -- One caller at a time per key, so parallel requests can't slip past the limit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('search_rate_ok:' || search_rate_ok.key, 0));
  delete from public.search_hits h
    where h.key = search_rate_ok.key
      and h.at < pg_catalog.now() - pg_catalog.make_interval(secs => search_rate_ok.window_seconds);
  select count(*) into recent from public.search_hits h where h.key = search_rate_ok.key;
  if recent >= search_rate_ok.max_hits then
    return false;
  end if;
  insert into public.search_hits (key) values (search_rate_ok.key);
  -- Now and then, clear out keys that went quiet.
  if pg_catalog.random() < 0.01 then
    delete from public.search_hits h where h.at < pg_catalog.now() - interval '1 day';
  end if;
  return true;
end;
$$;

revoke execute on function public.search_rate_ok(text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_rate_ok(text, integer, integer) to service_role;

-- Search helpers ----------------------------------------------------------------

-- The content words of a question, stemmed: English stopwords and filler
-- ("keep", "go", "feel", "deal", ...) removed, plus words nearly every sermon
-- uses ("god", "lord", "jesus"), which can't tell passages apart.
create function public.search_terms(query_text text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(distinct lex order by lex), '{}')
  from unnest(pg_catalog.tsvector_to_array(
         pg_catalog.to_tsvector('english'::regconfig, coalesce(left(query_text, 200), ''))
       )) as lex
  where lex ~ '^[a-z0-9]+$'
    and length(lex) > 1
    and lex <> all (array[
      'keep', 'go', 'goe', 'gone', 'went', 'back', 'feel', 'felt', 'deal', 'get', 'got', 'want',
      'know', 'help', 'thing', 'like', 'make', 'way', 'realli', 'someth', 'anyth', 'lot', 'much',
      'also', 'even', 'still', 'would', 'could', 'tri', 'come', 'take', 'say', 'see', 'look',
      'think', 'everi', 'start', 'stop', 'need', 'alway', 'never', 'anymor', 'struggl', 'person',
      'peopl', 'one', 'time', 'day', 'today', 'right', 'good', 'bad', 'well', 'let', 'can', 'use',
      'god', 'lord', 'jesus', 'christ', 'pleas', 'yes', 'okay', 'ok'
    ])
$$;

revoke execute on function public.search_terms(text) from public, anon, authenticated;
grant execute on function public.search_terms(text) to service_role;

-- Start time (seconds) of word k (0-based) of a passage, from its caption-line
-- map, interpolated by word position within the line.
create function public.passage_word_time(passage_id bigint, k integer)
returns real
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select p.seg_words, p.seg_times, p.words, p.start_s, p.end_s
    from public.passages p
    where p.id = passage_word_time.passage_id
  ),
  line as (
    select coalesce(max(i), 1) as i
    from p, generate_subscripts(p.seg_words, 1) as i
    where p.seg_words[i] <= greatest(passage_word_time.k, 0)
  )
  select (
    case
      when cardinality(p.seg_words) = 0 then p.start_s
      else
        p.seg_times[line.i]
        + (coalesce(p.seg_times[line.i + 1], p.end_s) - p.seg_times[line.i])
          * (least(greatest(passage_word_time.k, 0), p.words) - p.seg_words[line.i])
          / greatest(coalesce(p.seg_words[line.i + 1], p.words) - p.seg_words[line.i], 1)
    end
  )::real
  from p, line
$$;

revoke execute on function public.passage_word_time(bigint, integer) from public, anon, authenticated;
grant execute on function public.passage_word_time(bigint, integer) to service_role;

-- Meaning-led search -------------------------------------------------------------
-- 1. The 200 nearest passages by meaning (cosine), skipping near-copies from
--    other uploads and fragments under 120 words.
-- 2. score = similarity
--          + 0.03 x share of the question's content words the passage contains,
--                   each word weighted by how rare it is among the 200
--          - 0.25 x how far its repetition passes 0.12 (chants, songs)
--          - up to 0.03 for brevity (under 220 words: song and prayer fragments)
--          - up to 0.03 for sparse speech (under 1.6 words a second: talk
--                   broken up by music or long pauses)
--    Keywords and these quality signals only nudge: a passage can't overtake a
--    clearly better meaning match.
-- 3. Among twins (the same words in another upload, or a segment replayed in
--    the same upload) only the best copy stays.
-- 4. At most 2 passages per sermon; the second may not overlap the first and
--    ranks 0.015 lower, so other sermons get a turn first.
-- total_moments / total_sermons count candidates whose similarity is within
-- 0.05 of the 5th best; sermon_hits is that count for the row's sermon.
create function public.match_passages(
  query_embedding extensions.halfvec(768),
  query_text text,
  match_count integer default 40
)
returns table (
  id bigint,
  youtube_id text,
  start_s real,
  end_s real,
  words integer,
  similarity real,
  keyword real,
  score real,
  sermon_rank integer,
  sermon_hits integer,
  total_moments integer,
  total_sermons integer,
  excerpt text,
  excerpt_at real,
  text text,
  title text,
  headline text,
  published_at timestamptz,
  preached_on date,
  duration_seconds integer,
  thumbnail_url text,
  speaker text
)
language sql
stable
security definer
set search_path = ''
set hnsw.ef_search = 400
as $$
  with q as (
    select t.terms,
           case when cardinality(t.terms) > 0
                then pg_catalog.array_to_string(t.terms, ' | ')::pg_catalog.tsquery
           end as tsq
    from (select public.search_terms(query_text) as terms) t
  ),
  nn as (
    select p.id, p.youtube_id, p.start_s, p.end_s, p.words, p.rep, p.fts, p.twins,
           p.embedding operator(extensions.<=>) query_embedding as dist
    from public.passages p
    where p.dup_of is null and p.words >= 120
    order by p.embedding operator(extensions.<=>) query_embedding
    limit 200
  ),
  -- each content word's weight: rare among the candidates = informative
  term_weight as (
    select t.term,
           ln((count(*) + 1.0) / (count(*) filter (where nn.fts @@ t.term::pg_catalog.tsquery) + 0.5)) as w
    from q
    cross join unnest(q.terms) as t(term)
    cross join nn
    group by t.term
    having count(*) filter (where nn.fts @@ t.term::pg_catalog.tsquery) > 0
  ),
  scored as (
    select nn.id, nn.youtube_id, nn.start_s, nn.end_s, nn.words, nn.twins,
           (1 - nn.dist)::real as similarity,
           nn.words / greatest(nn.end_s - nn.start_s, 1) as wps,
           coalesce((
             select sum(tw.w) filter (where nn.fts @@ tw.term::pg_catalog.tsquery) / nullif(sum(tw.w), 0)
             from term_weight tw
           ), 0)::real as keyword,
           nn.rep
    from nn
  ),
  ranked as (
    select s.*,
           (s.similarity
            + 0.03 * s.keyword
            - 0.25 * greatest(s.rep - 0.12, 0)
            - 0.03 * least(greatest((220 - s.words) / 100.0, 0), 1)
            - 0.03 * least(greatest((1.6 - s.wps) / 0.6, 0), 1))::real as score
    from scored s
  ),
  -- the best-scoring copy among twins
  distinct_moments as (
    select r.*
    from ranked r
    where not exists (
      select 1 from ranked o
      where o.id = any (r.twins) and (o.score > r.score or (o.score = r.score and o.id < r.id))
    )
  ),
  first_pick as (
    select distinct on (r.youtube_id) r.*
    from distinct_moments r
    order by r.youtube_id, r.score desc, r.id
  ),
  second_pick as (
    select distinct on (r.youtube_id) r.*
    from distinct_moments r
    join first_pick f on f.youtube_id = r.youtube_id
    where r.id <> f.id and (r.start_s >= f.end_s - 1 or r.end_s <= f.start_s + 1)
    order by r.youtube_id, r.score desc, r.id
  ),
  picked as (
    select f.*, 1 as sermon_rank from first_pick f
    union all
    select s.id, s.youtube_id, s.start_s, s.end_s, s.words, s.twins, s.similarity, s.wps, s.keyword, s.rep,
           (s.score - 0.015)::real as score, 2 as sermon_rank
    from second_pick s
  ),
  top as (
    select pk.*
    from picked pk
    order by pk.score desc, pk.id
    limit greatest(1, least(coalesce(match_count, 40), 100))
  ),
  relevant as (
    select r.youtube_id, count(*)::integer as n
    from distinct_moments r
    where r.similarity >= (
      select min(x.similarity) - 0.05
      from (select d.similarity from distinct_moments d order by d.similarity desc limit 5) x
    )
    group by r.youtube_id
  ),
  totals as (
    select coalesce(sum(n), 0)::integer as moments, count(*)::integer as sermons from relevant
  ),
  shown as (
    select t.*, p.text as body,
           nullif(btrim(
             case when q.tsq is not null
                  then pg_catalog.ts_headline('english'::regconfig, p.text, q.tsq,
                         'MaxWords=34, MinWords=24, ShortWord=2, HighlightAll=false, StartSel=" ", StopSel=" "')
             end), '') as hl
    from top t
    join public.passages p on p.id = t.id
    cross join q
  )
  select sh.id, sh.youtube_id, sh.start_s, sh.end_s, sh.words, sh.similarity, sh.keyword, sh.score,
         sh.sermon_rank, coalesce(rl.n, 0), tt.moments, tt.sermons,
         ex.excerpt,
         coalesce(public.passage_word_time(sh.id, ex.first_word), sh.start_s),
         sh.body,
         s.title, s.headline, s.published_at, s.preached_on, s.duration_seconds, s.thumbnail_url, s.speaker
  from shown sh
  cross join totals tt
  left join relevant rl on rl.youtube_id = sh.youtube_id
  join public.sermons s on s.youtube_id = sh.youtube_id
  cross join lateral (
    select e.excerpt,
           case when e.pos > 1
                then coalesce(array_length(regexp_split_to_array(btrim(left(sh.body, e.pos - 1)), ' '), 1), 0)
                else 0 end as first_word
    from (
      select x.excerpt, strpos(sh.body, x.excerpt) as pos
      from (select coalesce(
                     regexp_replace(sh.hl, '\s+', ' ', 'g'),
                     array_to_string((regexp_split_to_array(sh.body, ' '))[1:30], ' ')
                   ) as excerpt) x
    ) e
  ) ex
  order by sh.score desc, sh.id
$$;

revoke execute on function public.match_passages(extensions.halfvec, text, integer) from public, anon, authenticated;
grant execute on function public.match_passages(extensions.halfvec, text, integer) to service_role;
