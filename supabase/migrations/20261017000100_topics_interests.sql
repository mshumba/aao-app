-- Saved topic picks, moved onto the 8 topics (20261016000300_topics.sql).
-- Until now profiles.interests held the four sample topics' ids. Each maps
-- to the topic that holds what it covered; prayer keeps its id:
--
--   spiritual-growth -> hearing-god
--   faith            -> faith-hope
--   christian-living -> everyday-life
--   prayer           -> prayer
--
-- A list keeps the topics' own order (as the app saves it), an id that maps
-- twice comes once, and any other id that isn't a topic goes (the app drops
-- those on the device too). Only lists holding an id that isn't a topic are
-- written. NOT RUN: applied after review.

begin;

-- With no topics loaded, every list would come out empty.
do $$
begin
  if (select count(*) from public.topics) <> 8 then
    raise exception 'Load the 8 topics (supabase/seed/topics.sql) before remapping saved picks';
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
