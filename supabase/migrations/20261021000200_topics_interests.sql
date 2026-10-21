-- Saved topic picks, moved onto the topics in public.topics
-- (20261016000300_topics.sql).
-- Until now profiles.interests held the four sample topics' ids. Each maps
-- to the topic that holds what it covered; prayer keeps its id:
--
--   spiritual-growth -> hearing-god
--   faith            -> faith-hope
--   christian-living -> everyday-life
--   prayer           -> prayer
--
-- The app maps these ids the same way on the device (RENAMED in
-- src/topics.tsx), so a guest's picks and an account saved on an older
-- build show the same topics.
--
-- A list keeps the topics' own order (as the app saves it), an id that maps
-- twice comes once, and any other id that isn't a topic goes (the app drops
-- those on the device too). Only lists holding an id that isn't a topic are
-- written. Its name sorts after every migration already applied, so
-- `supabase db push` takes it without --include-all. NOT RUN: applied
-- after review, before the app update that maps the ids is published.

begin;

-- Without the topics the old ids map to, every list would come out empty.
-- A project with no picks to move (a new one, say) has nothing to check.
do $$
begin
  if exists (
       select 1 from public.profiles
       where not (interests <@ array(select id from public.topics))
     )
     and (select count(*) from public.topics
          where id in ('hearing-god', 'prayer', 'faith-hope', 'everyday-life')) <> 4 then
    raise exception 'Load the topics (supabase/seed/topics.sql) before remapping saved picks';
  end if;
end $$;

update public.profiles as p
set interests = array(
  select t.id
  from public.topics t
  where t.id in (
    select case old
      when 'spiritual-growth' then 'hearing-god'
      when 'faith' then 'faith-hope'
      when 'christian-living' then 'everyday-life'
      else old
    end
    from unnest(p.interests) as old
  )
  order by t.sort
)
where not (p.interests <@ array(select id from public.topics));

commit;
