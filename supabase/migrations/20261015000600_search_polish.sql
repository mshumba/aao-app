-- Search polish (15 October 2026): faster and steadier need chips, hidden
-- passages, one database round trip before an uncached search, and the
-- privacy clean-up of search caches. Used by the search Edge Function
-- (supabase/functions/search, cache prefix search:v4:).
--
-- 1. needs.query and needs.related. A search whose text is a published need's
--    label or short name ("I keep falling into the same sin", "Fear") skips the
--    chat model: it searches needs.query, a fixed teaching phrase, and the label
--    itself, and answers with needs.theme, the 3 needs in needs.related and the
--    guided path whose paths.needs holds the need. A need without a query still
--    goes to the model.
-- 2. passages.hidden_from_search (+ hidden_note): a passage the ministry or a
--    reviewer judged hurtful in search results. match_passages() skips it.
--    Reversible: set hidden_from_search = false. Changing the flag empties
--    search_cache so the change shows at once.
-- 3. match_passages() also returns each row's twins and its cached quote, so
--    search no longer needs a second round trip after matching.
-- 4. search_start(): the cache read and both rate limits in one call.
-- 5. Privacy: pg_cron deletes search_cache rows (they hold answers to typed
--    questions) after 24 hours and search_hits (user ids and IP hashes) after
--    an hour, the longest rate-limit window. Every 15 minutes.
-- 6. Curated moments are readable only when they have no need or their need is
--    published (as with public.needs).

-- 1. Fixed teaching phrases and related needs -----------------------------------

alter table public.needs
  add column query text check (query is null or char_length(query) between 20 and 300),
  add column related text[] not null default '{}';

alter table public.needs
  add constraint needs_related_check check (cardinality(related) <= 3 and not (id = any (related)));

comment on column public.needs.query is
  'Fixed teaching phrase that search embeds for this need (instead of asking the chat model). Null: the model reads the label.';
comment on column public.needs.related is
  'Up to 3 needs.id offered as related chips on this need''s search, in order.';

-- Written for the audience: Pentecostal believers, mostly in Nigeria and Africa.
-- Phrased the way a preacher would teach it, naming the situation. The phrases
-- for hurting people (giving up, grief, rejection, shame) speak of comfort and
-- avoid words that pull in harsh passages.
update public.needs n
set query = v.query, related = v.related
from (values
  ('same-sin', 'How a believer breaks free from a sin they keep falling back into and walks in victory over the flesh',
    array['temptation', 'shame', 'self-control']),
  ('fear', 'How a believer overcomes the spirit of fear and stands firm in faith, knowing that God is with them',
    array['anxiety', 'future', 'faith']),
  ('waiting', 'How to keep trusting God and stay faithful while waiting a long time for His answer',
    array['delay', 'faith', 'discouraged']),
  ('prayer', 'How to build a consistent daily prayer life and keep the fire on the altar of prayer burning',
    array['presence', 'dryness', 'fasting']),
  ('hear-god', 'How a believer learns to hear the voice of God clearly and know when the Holy Spirit is speaking',
    array['holy-spirit', 'purpose', 'prayer']),
  ('shame', 'How a believer who has fallen receives the mercy of God, is cleansed from shame and rises again',
    array['same-sin', 'grace', 'drifted']),
  ('anxiety', 'How to cast all your cares on God and let His peace guard your heart instead of worrying',
    array['fear', 'future', 'money']),
  ('purpose', 'How to discover the purpose and will of God for your life and begin to walk in it',
    array['calling', 'hear-god', 'future']),
  ('temptation', 'How a believer resists temptation, flees from sin and overcomes the desires of the flesh',
    array['same-sin', 'purity', 'self-control']),
  ('discouraged', 'How God strengthens a weary believer who feels like giving up and renews their hope to keep going',
    array['waiting', 'faith', 'presence']),
  ('future', 'How to trust God with your future and not be afraid of what tomorrow holds',
    array['fear', 'anxiety', 'purpose']),
  ('dryness', 'How a believer who feels spiritually dry and cold rekindles their fire and returns to fellowship with God',
    array['presence', 'prayer', 'drifted']),
  ('marriage', 'How a husband and wife rebuild a struggling marriage through love, forgiveness, prayer and the word of God',
    array['forgive', 'relationships', 'prayer']),
  ('forgive', 'How to forgive someone who hurt you deeply and let go of bitterness and offence',
    array['offence', 'rejection', 'marriage']),
  ('money', 'How to trust God as your provider in financial hardship and stop worrying about money',
    array['anxiety', 'future', 'faith']),
  ('healing', 'How a believer who is sick receives divine healing by faith in the finished work of Christ',
    array['faith', 'prayer', 'presence']),
  ('rejection', 'How God heals the pain of rejection and shows you that you are accepted and loved in Christ',
    array['offence', 'forgive', 'presence']),
  ('grief', 'How God comforts a believer mourning the loss of a loved one and gives hope in the midst of sorrow',
    array['presence', 'discouraged', 'faith']),
  ('faith', 'How a believer whose faith feels weak grows strong in faith through the word of God',
    array['bible', 'prayer', 'delay']),
  ('presence', 'How to draw near to God and experience His presence in the secret place of prayer and worship',
    array['prayer', 'holy-spirit', 'dryness']),
  ('holiness', 'How a believer lives a holy life of consecration, separated from sin and pleasing to God',
    array['grace', 'purity', 'self-control']),
  ('grace', 'Understanding the grace of God: what it is, what it does in a believer and how to walk in it',
    array['holiness', 'shame', 'faith']),
  ('self-control', 'How a believer brings the appetites of the flesh under control and walks in self-control by the Spirit',
    array['temptation', 'purity', 'fasting']),
  ('purity', 'How a believer overcomes lust and sexual temptation and keeps their body pure for God',
    array['temptation', 'same-sin', 'relationships']),
  ('drifted', 'How a backslidden believer who has drifted away from God returns to Him and rebuilds their altar',
    array['dryness', 'shame', 'prayer']),
  ('delay', 'How to hold on to the promise of God when it seems delayed and trust His timing for its fulfilment',
    array['waiting', 'faith', 'discouraged']),
  ('fasting', 'How to fast the right way: the purpose of fasting and how to fast and pray effectively',
    array['prayer', 'self-control', 'spiritual-attack']),
  ('calling', 'How a believer recognises the call of God on their life and takes the first steps to obey it',
    array['purpose', 'hear-god', 'burnout']),
  ('singleness', 'How a single believer waits on God for a spouse and chooses a godly partner for marriage',
    array['relationships', 'purity', 'waiting']),
  ('relationships', 'How to build a courtship that honours God and stays pure before marriage',
    array['singleness', 'purity', 'marriage']),
  ('offence', 'How to overcome offence and find healing when you have been hurt by people in the church',
    array['forgive', 'rejection', 'burnout']),
  ('spiritual-attack', 'How a believer stands firm and wins in spiritual warfare when under attack from the enemy',
    array['fear', 'prayer', 'fasting']),
  ('burnout', 'How a minister or worker who is worn out from serving finds rest and renewed strength in God',
    array['discouraged', 'calling', 'presence']),
  ('holy-spirit', 'How to know the Holy Spirit as a person and walk in daily fellowship with Him',
    array['presence', 'hear-god', 'prayer']),
  ('bible', 'How to build a habit of studying the word of God daily and understand the scriptures',
    array['prayer', 'hear-god', 'faith']),
  ('new-believer', 'The first steps of a new believer who just gave their life to Jesus: prayer, the word and fellowship',
    array['bible', 'prayer', 'holy-spirit'])
) as v(id, query, related)
where n.id = v.id;

-- Every published need has a phrase and 3 published related needs (on a fresh
-- database the needs are seeded after the migrations, so this checks nothing).
do $$
declare
  bad text;
begin
  select string_agg(n.id, ', ' order by n.sort) into bad
  from public.needs n
  where n.published
    and (n.query is null
         or cardinality(n.related) <> 3
         or exists (select 1 from unnest(n.related) r
                    where not exists (select 1 from public.needs m where m.id = r and m.published)));
  if bad is not null then
    raise exception 'needs without a query or 3 published related needs: %', bad;
  end if;
end;
$$;

-- 2. Hidden passages ------------------------------------------------------------

alter table public.passages
  add column hidden_from_search boolean not null default false,
  add column hidden_note text check (hidden_note is null or char_length(hidden_note) <= 500);

comment on column public.passages.hidden_from_search is
  'True: match_passages() never returns this passage. Reversible; hidden_note says why.';

-- A change to the flag empties the search cache, so it shows in the next search.
create function public.passages_hidden_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.search_cache where true;
  return null;
end;
$$;

revoke execute on function public.passages_hidden_changed() from public, anon, authenticated;

create trigger passages_hidden_changed
  after update of hidden_from_search on public.passages
  for each row
  when (old.hidden_from_search is distinct from new.hidden_from_search)
  execute function public.passages_hidden_changed();

-- From the blind search judge (15 October 2026): both ranked in the top 5 of
-- every run for people they would hurt.
update public.passages
set hidden_from_search = true,
    hidden_note = case id
      when 50685 then 'Search judge, 15 Oct 2026: "illegal grief" (no need to grieve unless estranged from God; '
                      || 'about an eviction). Top 5 for "I''m grieving someone I lost" in every run; tells the bereaved '
                      || 'their grief is illegitimate.'
      when 139549 then 'Search judge, 15 Oct 2026: a couple''s banter and a warning about delaying children with '
                       || 'contraceptives. Top 5 for a couple trusting God for a child for 6 years in every run; reads '
                       || 'as blame.'
    end
where id in (50685, 139549);

-- 3. match_passages: skip hidden passages; return twins and cached quotes ---------
-- Same ranking as in migration need_search. The return type gains twins, quote
-- and quote_at, so the function is dropped and created again.

drop function public.match_passages(extensions.halfvec, text, integer);

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
  speaker text,
  twins bigint[],
  quote text,
  quote_at real
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
    where p.dup_of is null and p.words >= 120 and not p.hidden_from_search
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
         s.title, s.headline, s.published_at, s.preached_on, s.duration_seconds, s.thumbnail_url, s.speaker,
         sh.twins, pq.quote, pq.quote_at
  from shown sh
  cross join totals tt
  left join relevant rl on rl.youtube_id = sh.youtube_id
  join public.sermons s on s.youtube_id = sh.youtube_id
  left join public.passage_quotes pq
    on pq.passage_id = sh.id and pq.quote is not null and pq.quote_at is not null
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

-- 4. search_start: the cache and the rate limits in one round trip ----------------
-- A fresh cached answer comes back with the quotes cached since for its moments
-- that had none ({"cached": ..., "quotes": {"<passage id>": {"quote", "at"}}}),
-- and isn't counted. Otherwise each limit is checked in order with
-- search_rate_ok(), stopping at the first refusal, so a caller refused by their
-- own limit never uses up the shared one: {"ok": true} or
-- {"ok": false, "retry_after": seconds}.

create function public.search_start(
  cache_key text,
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
  oldest timestamptz;
  i integer;
begin
  if cardinality(rate_keys) is distinct from cardinality(rate_max)
     or cardinality(rate_keys) is distinct from cardinality(rate_windows) then
    raise exception 'search_start: rate arrays differ in length' using errcode = '22023';
  end if;

  select c.response into hit
  from public.search_cache c
  where c.key = search_start.cache_key
    and c.created_at >= pg_catalog.now() - pg_catalog.make_interval(secs => search_start.max_age_seconds);
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

  for i in 1 .. coalesce(cardinality(rate_keys), 0) loop
    if not public.search_rate_ok(rate_keys[i], rate_max[i], rate_windows[i]) then
      select min(h.at) into oldest from public.search_hits h where h.key = rate_keys[i];
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'retry_after', least(greatest(coalesce(
          pg_catalog.ceil(extract(epoch from oldest + pg_catalog.make_interval(secs => rate_windows[i]) - pg_catalog.now())),
          60), 1), rate_windows[i])::integer);
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.search_start(text, integer, text[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.search_start(text, integer, text[], integer[], integer[]) to service_role;

-- 5. Privacy clean-up -------------------------------------------------------------

create function public.search_cleanup()
returns void
language sql
set search_path = ''
as $$
  delete from public.search_cache where created_at < pg_catalog.now() - interval '24 hours';
  delete from public.search_hits where at < pg_catalog.now() - interval '1 hour';
$$;

revoke execute on function public.search_cleanup() from public, anon, authenticated;
grant execute on function public.search_cleanup() to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('search-cleanup', '*/15 * * * *', 'select public.search_cleanup()');

select public.search_cleanup();

-- 6. Moments of unpublished needs stay hidden ----------------------------------------

drop policy "Anyone reads moments" on public.moments;

create policy "Anyone reads moments of published needs"
  on public.moments for select to anon, authenticated
  using (
    need_id is null
    or exists (select 1 from public.needs n where n.id = moments.need_id and n.published)
  );
