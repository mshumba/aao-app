-- Clean verbatim fix (15 October 2026): a repeat said on purpose stays in a quote.
--
-- An adversarial check of today's quotes against the raw YouTube captions
-- found two quotes where leaving out a "repeat" changed what was said:
--   66954  cut one of three "pray every day" from a chant ("read your Bible,
--          pray every day; pray every day, ...");
--   111725 cut the pointing "that" of "doesn't mean that that deliverance is
--          permanent", so it read as deliverance in general.
-- It also found cached quotes that keep a caption mistake ("they take faces"
-- for phases, "sunship", "in the Fate", "contined preaching", "relationing",
-- "wisdom wiom"), start or stop mid-sentence ("Prison Peter was in chain",
-- "it is a proven fact." before "that whatever you give that child"), are
-- garbled ("it not your faith didn't fail", "He happens to be that I'm a
-- king") or say nothing on their own ("The dangers of life, the pressures of
-- life.", "And with that energy, we traveled off to Nigeria.", "For whom the
-- Lord loveth, what does he do to him?").
--
-- 1. Those 19 cached quotes are replaced with exact caption spans chosen by
--    hand (model 'manual'; play from 3 s before the first word, as
--    playFrom() does), or with none for the two passages hidden from search.
-- 2. Cached search answers that carry the old quotes are patched in place.
-- 3. public.is_clean_verbatim() lets a quote leave out only a stutter, not a
--    repeat said on purpose. Same as isStutter() in
--    supabase/functions/_shared/verbatim.ts and is_stutter() in the transcript
--    pipeline (aao_embed/verbatim.py), tested on verbatim_cases.json:
--      - 2-3 words: only a restart on a small word ("we are we are", "it's a
--        it's a"), never with "and" ("again and again");
--      - 1 word: never an emphatic word ("very very", "no no", "holy holy") or
--        "had had"; never a word that isn't small said 3 or more times ("holy
--        holy holy", "pray pray pray"; "he he he" still goes); never "that
--        that" before a word that isn't small ("that that deliverance").
--    Every live quote (passage_quotes, moments, path_days) passes it.

-- 1. Cached quotes -------------------------------------------------------------

create temp table quote_fix (passage_id bigint primary key, quote text, quote_at real);

insert into quote_fix (passage_id, quote, quote_at) values
  (66954, 'God wants to use you; He wants to lay His hand strong upon you, but you have to grow every day so that you don''t jump into what He wants to do and then wreck your life.',
   6476.76),
  (111725, 'The fact that you have received deliverance from a particular thing doesn''t mean that that deliverance is permanent except you depend on God.',
   1241.25),
  (90344, 'Scientifically, it is proven that whatever takes place before the age 12 in every human being''s life is stored in the limbic system.',
   2374.16),
  (117756, 'I gave it to Him and trusted Him enough that what He has promised me, He will surely bring it to pass, no matter how long it took.',
   3450.34),
  (48659, 'It means that God is with you in the matter, because He made you to look at Him as your strength.',
   10065.46),
  (23390, 'It''s not because the prayer did not work; it''s not because the fasting did not have any effect. The enemy doesn''t want to lose the ground of your life.',
   2019.36),
  (102869, 'If you don''t have the waterings of God, which is the comfort of the scriptures, the scriptures that the Holy Spirit fires into your heart, you will not be able to survive the waiting process.',
   10588.75),
  (64376, 'If you come to a point where you conquer the power of sin, that''s the first point of deliverance; then there''s another point here: you must conquer the power of self.',
   6268.51),
  (94644, 'That kind of setup can reduce you from 100 to 60 to 30 and then to no fold.',
   9089.06),
  (82153, 'Imagine being in this world without hope, without God: your survival is at risk.',
   6761.72),
  (25781, 'You need to be in very good balance, in health, in spirit, to be able to combat spiritual warfare. Don''t stand at any extreme; Satan will exploit it.',
   7973.64),
  (11509, 'There is no earthly natural father or spiritual father who can take the place of the Father in Heaven. This doesn''t mean you don''t need natural fathers, and it doesn''t mean you don''t need spiritual fathers.',
   40573.38),
  (57462, 'The reason why it needs to be persistent is because Satan will not back out at your first charge; he will never back out just because you shouted.',
   2100.23),
  (139554, 'Part of the things you give in love is that you labor. You labor for what you want to see, and you have to be committed.',
   7126.84),
  (166263, 'And the Lord truly indeed was faithful, and we''ve come to return the glory to Him.',
   6935.93),
  (6035, 'If you maintain this position with your dad, you''re going to become that kind of a father to your own children.',
   9286.12),
  (51017, 'When you allow God to deal with you on a matter, there is a glory that cannot be revealed anywhere else that will come from that process.',
   3503.92),
  (50685, null::text,
   null::real),
  (139549, null::text,
   null::real);

update public.passage_quotes pq
set quote = f.quote, quote_at = f.quote_at, model = 'manual'
from quote_fix f
where pq.passage_id = f.passage_id;

-- 2. Cached search answers -----------------------------------------------------
-- A cached answer keeps the quote it was cached with, so the new ones are
-- written into it ("at" rounded as search rounds it). An answer showing a
-- passage whose quote is now none is dropped (none are cached today: both are
-- hidden from search).

delete from public.search_cache c
where exists (
  select 1
  from pg_catalog.jsonb_array_elements(c.response -> 'moments') e
  join quote_fix f on f.passage_id::text = e ->> 'id'
  where f.quote is null
);

update public.search_cache c
set response = pg_catalog.jsonb_set(c.response, '{moments}', (
  select pg_catalog.jsonb_agg(
           case when f.passage_id is null then e
                else e || pg_catalog.jsonb_build_object(
                  'quote', f.quote, 'at', round(f.quote_at::float8::numeric, 2))
           end order by o)
  from pg_catalog.jsonb_array_elements(c.response -> 'moments') with ordinality as t(e, o)
  left join quote_fix f on f.passage_id::text = t.e ->> 'id'
))
where exists (
  select 1
  from pg_catalog.jsonb_array_elements(c.response -> 'moments') e
  join quote_fix f on f.passage_id::text = e ->> 'id'
);

drop table quote_fix;

-- 3. The word rule -------------------------------------------------------------

create or replace function public.is_clean_verbatim(quote text, passage_text text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  fillers constant text[] := array['uh', 'um', 'er', 'erm', 'ah', 'hmm', 'mm'];
  -- Small words a speaker restarts on (isStutter()'s RESTART).
  restart constant text[] := pg_catalog.string_to_array(
    'a an the to of in on at for from with by as or but so if that this these those my your our their his her its '
    'i you he she we they it me us him them is are was were be been am do does did dont doesnt didnt have has had '
    'will would can could shall should must not im youre theyre ive thats there what who which when where how lets '
    'know mean', ' ');
  -- Words a preacher doubles for emphasis (isStutter()'s EMPHATIC).
  emphatic constant text[] := pg_catalog.string_to_array(
    'very never no yes holy again more much really too ever amen hallelujah glory far long oh', ' ');
  qw text := public.verbatim_words(quote);
  pw text;
  q text[];
  p text[];
  nq integer;
  np integer;
  nf integer[];          -- positions of the passage words that aren't fillers
  nnf integer := 0;
  fpos integer[];        -- each passage word's index in nf (0 for a filler)
  jump integer[];        -- jump[j][n]: where the first copy of a stutter of n words at j goes on to (0: none)
  reach boolean[];       -- reach[j]: the quote so far is matched and passage word j is next
  nxt boolean[];
  alive boolean := false;
  same boolean;
  w text;
  f integer;
  t integer;
begin
  if quote is null or passage_text is null or qw = '' then
    return false;
  end if;
  -- Letters, digits, spaces and ordinary punctuation only; no ellipsis.
  if quote !~ '^[A-Za-z0-9 .,;:!?''"’‘“”—–-]+$' or pg_catalog.strpos(quote, '..') > 0 then
    return false;
  end if;
  pw := public.verbatim_words(passage_text);
  -- Most quotes are an exact run of the caption words.
  if pg_catalog.strpos(' ' || pw || ' ', ' ' || qw || ' ') > 0 then
    return true;
  end if;

  q := pg_catalog.string_to_array(qw, ' ');
  p := pg_catalog.string_to_array(pw, ' ');
  nq := coalesce(pg_catalog.array_length(q, 1), 0);
  np := coalesce(pg_catalog.array_length(p, 1), 0);
  if nq = 0 or np = 0 then
    return false;
  end if;

  nf := pg_catalog.array_fill(0, array[np]);
  fpos := pg_catalog.array_fill(0, array[np]);
  for j in 1..np loop
    if not (p[j] = any (fillers)) then
      nnf := nnf + 1;
      nf[nnf] := j;
      fpos[j] := nnf;
    end if;
  end loop;

  jump := pg_catalog.array_fill(0, array[np, 3]);
  for j in 1..np loop
    f := fpos[j];
    continue when f = 0;
    for n in 1..3 loop
      exit when f + 2 * n - 1 > nnf;
      same := true;
      for i in 0..n - 1 loop
        if p[nf[f + i]] <> p[nf[f + n + i]] then
          same := false;
          exit;
        end if;
      end loop;
      -- Only a stutter may be left out, not a repeat said on purpose.
      if same and n > 1 then
        same := p[nf[f + n - 1]] = any (restart);
        for i in 0..n - 1 loop
          if p[nf[f + i]] = 'and' then
            same := false;
          end if;
        end loop;
      elsif same then
        w := p[nf[f]];
        if w = any (emphatic) or w = 'had' then
          same := false;
        elsif not (w = any (restart))
              and ((f + 2 <= nnf and p[nf[f + 2]] = w) or (f > 1 and p[nf[f - 1]] = w)) then
          same := false;
        elsif w = 'that' and f + 2 <= nnf and not (p[nf[f + 2]] = any (restart)) then
          same := false;
        end if;
      end if;
      if same then
        jump[j][n] := nf[f + n];
      end if;
    end loop;
  end loop;

  -- The first quote word may start anywhere.
  reach := pg_catalog.array_fill(false, array[np + 1]);
  for j in 1..np loop
    if p[j] = q[1] then
      reach[j + 1] := true;
      alive := true;
    end if;
  end loop;

  for k in 2..nq loop
    exit when not alive;
    -- Leave out fillers and first copies of stutters (targets are always later).
    for j in 1..np loop
      continue when not reach[j];
      if fpos[j] = 0 then
        reach[j + 1] := true;
      else
        for n in 1..3 loop
          t := jump[j][n];
          if t > 0 then
            reach[t] := true;
          end if;
        end loop;
      end if;
    end loop;
    nxt := pg_catalog.array_fill(false, array[np + 1]);
    alive := false;
    for j in 1..np loop
      if reach[j] and p[j] = q[k] then
        nxt[j + 1] := true;
        alive := true;
      end if;
    end loop;
    reach := nxt;
  end loop;
  return alive;
end;
$$;

comment on function public.is_clean_verbatim(text, text) is
  'True when quote is a contiguous run of passage_text''s caption words with only capitals and punctuation added and only fillers (uh, um, er, erm, ah, hmm, mm) and stutters (an immediate repeat of 1-3 words that is not said on purpose: see isStutter()) left out. Same as cleanSpan() in supabase/functions/_shared/verbatim.ts.';
