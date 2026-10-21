-- Home opens with hope, not sin (owner, 16 Oct 2026, on TestFlight build 3:
-- "if the first thing you're hit when you open app is sin no thanks").
--
-- Needs: the first eight are Home's chips and the first twelve Search's, so
-- they lead with hearing God, his presence, purpose, prayer and faith, with
-- the common struggles (fear, anxiety, grief, money) still among them. Sin,
-- shame and temptation come later, a tap away under Search's "Show all
-- needs" (and found by typing, as every need is).
--
-- Paths: Home's "Start here" and the Paths tab's masthead are the first
-- guided path, now "Hearing the voice of God". The teaching series keep
-- their places (101 to 105).
--
-- Order only: nothing is published, hidden or reworded. Re-running the
-- seeds (supabase/seed/needs.sql, paths.sql) would put the old order back
-- until they carry these numbers too.

update public.needs as n
set sort = v.sort
from (values
  ('hear-god', 1),
  ('presence', 2),
  ('fear', 3),
  ('purpose', 4),
  ('prayer', 5),
  ('anxiety', 6),
  ('faith', 7),
  ('waiting', 8),
  ('holy-spirit', 9),
  ('healing', 10),
  ('grief', 11),
  ('money', 12),
  ('discouraged', 13),
  ('future', 14),
  ('marriage', 15),
  ('drifted', 16),
  ('forgive', 17),
  ('calling', 18),
  ('grace', 19),
  ('holiness', 20),
  ('dryness', 21),
  ('rejection', 22),
  ('bible', 23),
  ('new-believer', 24),
  ('fasting', 25),
  ('same-sin', 26),
  ('shame', 27),
  ('temptation', 28),
  ('self-control', 29),
  ('purity', 30),
  ('delay', 31),
  ('singleness', 32),
  ('relationships', 33),
  ('offence', 34),
  ('spiritual-attack', 35),
  ('burnout', 36)
) as v (id, sort)
where n.id = v.id;

update public.paths as p
set sort = v.sort
from (values
  ('hearing-the-voice-of-god', 1),
  ('building-a-life-of-prayer', 2),
  ('discovering-your-purpose-and-calling', 3),
  ('learning-to-wait-on-god', 4),
  ('overcoming-fear-and-anxiety', 5),
  ('walking-in-grace-and-holiness', 6),
  ('fasting-with-purpose', 7),
  ('breaking-free-from-habitual-sin', 8)
) as v (id, sort)
where p.id = v.id;
