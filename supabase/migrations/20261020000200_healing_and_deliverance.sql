-- Healing and Deliverance become two topics (owner, 20 Oct 2026: "healing
-- should be its own deliverance its own"). Comfort & Healing is renamed
-- Healing, with id healing; comfort for the sick and the weary stays in it.
-- Deliverance is new and is added by supabase/seed/topics.sql, which also
-- sets both topics' text and vectors.
--
-- The rename cascades through every foreign key (sermon_topics.topic_id,
-- topic_vectors.topic_id, sermon_cards.topic and also_topic, all "on update
-- cascade"). profiles.interests is a plain text[] with no foreign key, so a
-- viewer who picked Comfort & Healing is moved to Healing here.
--
-- Order: this migration, then supabase/seed/topics.sql (9 topics), then
-- scripts/read-sermons.py save with the re-classified cards, then the paths
-- and series seeds.

begin;

update public.topics set id = 'healing' where id = 'comfort-healing';

update public.profiles
set interests = array_replace(interests, 'comfort-healing', 'healing')
where 'comfort-healing' = any (interests);

commit;
