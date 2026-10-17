-- Search safety (17 October 2026): stored embeddings so a need chip and the
-- comfort list never need OpenAI, one database call that knows a chip and says
-- which limit refused, and sermon-title matches for when OpenAI is down. Used
-- by the search Edge Function from this change on (cache prefix search:v5:).
--
-- 1. need_vectors: each published need's teaching phrase (needs.query) and
--    label, embedded once by the search function (the first time the chip is
--    used, or all at once with POST {"warm": true}) and kept. A row counts only
--    while the need is published and its label, short name and query are still
--    what was embedded, so editing a need's wording makes search embed it
--    again. label_norm / short_norm are the function's normalise() of label and
--    short, which is how a search is compared with a chip.
-- 2. search_vectors: fixed phrases searched by meaning, embedded once. Key
--    'care': the comfort phrasing searched for someone in distress (CARE_QUERY
--    in supabase/functions/_shared/prompts.ts); used only while input is that
--    phrase.
-- 3. search_open(): what search_start() did (the 24-hour cache with the quotes
--    found since, then the rate limits in order), plus:
--    - a chip with stored embeddings comes back as {"ok": true, "need": {...}}
--      before the limits, and isn't counted: it needs no OpenAI call;
--    - with care_input, the comfort phrasing's stored embedding ("care_vector");
--    - a refusal says which limit refused ("limit", counting from 1), so the
--      app can say "Search is busy for everyone right now" for the shared one.
--    search_start() stays until the previous function version is retired.
-- 4. match_sermon_titles(): sermons whose title or headline holds the
--    question's content words, for when the question can't be embedded.
--
-- Same rules as the earlier migrations: row level security on, explicit
-- grants, and only the service role (the Edge Functions) can reach any of it.

-- 1. Stored embeddings of the need chips ------------------------------------------

create table public.need_vectors (
  need_id text primary key references public.needs (id) on update cascade on delete cascade,
  -- The need's wording when it was embedded.
  label text not null,
  short text not null,
  query text not null,
  label_norm text not null check (char_length(label_norm) between 1 and 200),
  short_norm text not null check (char_length(short_norm) between 1 and 200),
  -- How it was embedded: 'text-embedding-3-large@768', as the passages were.
  model text not null check (char_length(model) between 1 and 100),
  query_embedding extensions.halfvec(768) not null,
  label_embedding extensions.halfvec(768) not null,
  updated_at timestamptz not null default now()
);

comment on table public.need_vectors is
  'Embeddings of each need chip''s query and label, so a chip tap needs no OpenAI call. Written by the search Edge Function.';

alter table public.need_vectors enable row level security;

revoke all on public.need_vectors from anon, authenticated;
grant select, insert, update, delete on public.need_vectors to service_role;

-- 2. Stored embeddings of fixed phrases ----------------------------------------------

create table public.search_vectors (
  key text primary key check (char_length(key) between 1 and 100),
  -- Exactly the text embedded.
  input text not null check (char_length(input) between 1 and 1000),
  model text not null check (char_length(model) between 1 and 100),
  embedding extensions.halfvec(768) not null,
  updated_at timestamptz not null default now()
);

comment on table public.search_vectors is
  'Embeddings of fixed phrases search uses (key ''care'': the comfort phrasing). Written by the search Edge Function.';

alter table public.search_vectors enable row level security;

revoke all on public.search_vectors from anon, authenticated;
grant select, insert, update, delete on public.search_vectors to service_role;

-- 3. search_open: cache, stored chip, limits ------------------------------------------
-- Returns one of:
--   {"cached": <answer>, "quotes": {"<passage id>": {"quote", "at"}}}  (not counted)
--   {"ok": true, "need": {"id", "query_embedding", "label_embedding"}}  (not counted)
--   {"ok": true, "care_vector": <text or null>}                          (counted)
--   {"ok": false, "limit": <1-based index>, "retry_after": <seconds>, "care_vector": ...}
-- query_norm null: never a chip (someone in distress). care_input null: no
-- care_vector. The limits are checked in order with search_rate_ok(), stopping
-- at the first refusal, so a caller refused by their own limit never uses up
-- the shared one.

create function public.search_open(
  cache_key text,
  query_norm text,
  vector_model text,
  care_input text,
  max_age_seconds integer,
  rate_keys text[],
  rate_max integer[],
  rate_windows integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hit jsonb;
  chip jsonb;
  care_vec text;
  oldest timestamptz;
  i integer;
begin
  if cardinality(rate_keys) is distinct from cardinality(rate_max)
     or cardinality(rate_keys) is distinct from cardinality(rate_windows) then
    raise exception 'search_open: rate arrays differ in length' using errcode = '22023';
  end if;

  select c.response into hit
  from public.search_cache c
  where c.key = search_open.cache_key
    and c.created_at >= pg_catalog.now() - pg_catalog.make_interval(secs => search_open.max_age_seconds);
  if hit is not null then
    return pg_catalog.jsonb_build_object(
      'cached', hit,
      'quotes', coalesce((
        select pg_catalog.jsonb_object_agg(pq.passage_id::text,
                 pg_catalog.jsonb_build_object('quote', pq.quote, 'at', pq.quote_at))
        from public.passage_quotes pq
        where pq.quote is not null and pq.quote_at is not null
          and pq.passage_id in (
            select (m ->> 'id')::bigint
            from pg_catalog.jsonb_array_elements(coalesce(hit -> 'moments', '[]'::jsonb)) m
            where m ->> 'quote' is null and m ->> 'id' ~ '^[0-9]{1,18}$')
      ), '{}'::jsonb));
  end if;

  if search_open.query_norm is not null and search_open.query_norm <> '' then
    select pg_catalog.jsonb_build_object(
             'id', v.need_id,
             'query_embedding', v.query_embedding::text,
             'label_embedding', v.label_embedding::text)
      into chip
    from public.need_vectors v
    join public.needs n on n.id = v.need_id
    where n.published
      and n.query is not null
      and (v.label_norm = search_open.query_norm or v.short_norm = search_open.query_norm)
      and v.model = search_open.vector_model
      and v.label = n.label
      and v.short = n.short
      and v.query = n.query
    order by n.sort, n.id
    limit 1;
    if chip is not null then
      return pg_catalog.jsonb_build_object('ok', true, 'need', chip);
    end if;
  end if;

  if search_open.care_input is not null then
    select sv.embedding::text into care_vec
    from public.search_vectors sv
    where sv.key = 'care' and sv.input = search_open.care_input and sv.model = search_open.vector_model;
  end if;

  for i in 1 .. coalesce(cardinality(rate_keys), 0) loop
    if not public.search_rate_ok(rate_keys[i], rate_max[i], rate_windows[i]) then
      select min(h.at) into oldest from public.search_hits h where h.key = rate_keys[i];
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'limit', i,
        'care_vector', care_vec,
        'retry_after', least(greatest(coalesce(
          pg_catalog.ceil(extract(epoch from oldest + pg_catalog.make_interval(secs => rate_windows[i]) - pg_catalog.now())),
          60), 1), rate_windows[i])::integer);
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'care_vector', care_vec);
end;
$$;

revoke execute on function public.search_open(text, text, text, text, integer, text[], integer[], integer[])
  from public, anon, authenticated;
grant execute on function public.search_open(text, text, text, text, integer, text[], integer[], integer[])
  to service_role;

-- 4. Sermon-title matches ------------------------------------------------------------
-- The question's content words (search_terms(): stemmed, stopwords and filler
-- removed) against each sermon's headline and exact title, best first. About
-- 2,850 sermons, so the text is read on the fly rather than indexed; this runs
-- only when the question can't be embedded.

create function public.match_sermon_titles(query_text text, match_count integer default 10)
returns table (
  youtube_id text,
  title text,
  headline text,
  published_at timestamptz,
  preached_on date,
  duration_seconds integer,
  thumbnail_url text,
  speaker text,
  rank real
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select case when cardinality(t.terms) > 0
                then pg_catalog.array_to_string(t.terms, ' | ')::pg_catalog.tsquery
           end as tsq
    from (select public.search_terms(query_text) as terms) t
  ),
  docs as (
    select s.*, pg_catalog.to_tsvector('english'::regconfig, s.headline || ' ' || s.title) as doc
    from public.sermons s
  )
  select d.youtube_id, d.title, d.headline, d.published_at, d.preached_on, d.duration_seconds, d.thumbnail_url,
         d.speaker, pg_catalog.ts_rank(d.doc, q.tsq)::real as rank
  from docs d
  cross join q
  where q.tsq is not null and d.doc @@ q.tsq
  order by rank desc, d.published_at desc, d.youtube_id
  limit greatest(1, least(coalesce(match_count, 10), 50))
$$;

revoke execute on function public.match_sermon_titles(text, integer) from public, anon, authenticated;
grant execute on function public.match_sermon_titles(text, integer) to service_role;
