-- Clean verbatim quotes (approved by the owner, 15 October 2026).
--
-- A quote is a contiguous run of a passage's caption words with capitals and
-- punctuation added, where two kinds of caption noise may be left out:
--   - filler sounds: uh, um, er, erm, ah, hmm, mm;
--   - an immediate repeat of 1-3 words, keeping one copy ("if if you" becomes
--     "if you", "we are we are" becomes "we are").
-- No other word may be changed, added, reordered or left out. The strict rule
-- before this (public.is_verbatim: an exact run of caption words) showed
-- stutters and fillers in quotes; the clean rule lets them go and nothing else.
--
-- public.is_clean_verbatim() is the word check. It is the same as cleanSpan()
-- in supabase/functions/_shared/verbatim.ts and clean_span() in the transcript
-- pipeline (aao_embed/verbatim.py); all three are tested on
-- supabase/functions/_shared/verbatim_cases.json. Length (8-45 words) and
-- ending on a sentence end are checked in that code, not here.
--
-- 1. The moments and passage_quotes triggers now use the clean check.
-- 2. path_days.key_quote had no check: a new trigger requires it to be clean
--    verbatim from a passage of the day's sermon that is playing at key_at
--    (key_at is about 3 s before the quote). All 44 current days pass.
-- public.is_verbatim() stays; nothing else changes.

create function public.is_clean_verbatim(quote text, passage_text text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  fillers constant text[] := array['uh', 'um', 'er', 'erm', 'ah', 'hmm', 'mm'];
  qw text := public.verbatim_words(quote);
  pw text;
  q text[];
  p text[];
  nq integer;
  np integer;
  nf integer[];          -- positions of the passage words that aren't fillers
  nnf integer := 0;
  fpos integer[];        -- each passage word's index in nf (0 for a filler)
  jump integer[];        -- jump[j][n]: where the first copy of a repeat of n words at j goes on to (0: none)
  reach boolean[];       -- reach[j]: the quote so far is matched and passage word j is next
  nxt boolean[];
  alive boolean := false;
  same boolean;
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
    -- Leave out fillers and first copies of repeats (targets are always later).
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
  'True when quote is a contiguous run of passage_text''s caption words with only capitals and punctuation added and only fillers (uh, um, er, erm, ah, hmm, mm) and immediate repeats of 1-3 words left out. Same as cleanSpan() in supabase/functions/_shared/verbatim.ts.';

revoke execute on function public.is_clean_verbatim(text, text) from public, anon, authenticated;
grant execute on function public.is_clean_verbatim(text, text) to service_role;

-- 1. Moments and the quote cache ----------------------------------------------

create or replace function public.moments_check_quote()
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
  if not public.is_clean_verbatim(new.quote, p_text) then
    raise exception 'moment quote is not clean verbatim from passage %', new.passage_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.passage_quotes_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quote is not null and not public.is_clean_verbatim(
       new.quote, (select p.text from public.passages p where p.id = new.passage_id)) then
    raise exception 'cached quote is not clean verbatim from passage %', new.passage_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 2. Path days ----------------------------------------------------------------
-- Passages overlap (each is about 2.5 minutes of captions), so a key quote sits
-- whole inside at least one passage that is playing at key_at.

create function public.path_days_check_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.passages p
    where p.youtube_id = new.youtube_id
      and p.start_s <= new.key_at + 60
      and p.end_s >= new.key_at
      and public.is_clean_verbatim(new.key_quote, p.text)
  ) then
    raise exception 'path day %/% key quote is not clean verbatim from sermon % near % s',
      new.path_id, new.day, new.youtube_id, new.key_at
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger path_days_check_quote
  before insert or update of key_quote, key_at, youtube_id on public.path_days
  for each row execute function public.path_days_check_quote();

revoke execute on function public.path_days_check_quote() from public, anon, authenticated;
