-- Topics re-tuned after a hand-check (16 Oct 2026). Argon checked 136 sermons
-- (docs/topic-check, local). The embedding-only tagging in
-- 20261016000300_topics.sql was right for most topics, but it made Everyday
-- Life and Comfort & Healing catch-alls: standardising per topic gave every
-- topic a similar share of the catalogue, however rarely it's preached on.
--
-- Now an AI reader (gpt-5.4-mini) reads each sermon's title and transcript
-- excerpts against written rules for each topic and names its main topic, or
-- none. A sermon is tagged only when the reader's topic is also one of its two
-- best embedding matches: one topic per sermon (rank 1), with score the
-- embedding z, so a topic lists its best matches first. Agreement between the
-- two was right far more often than either alone against the hand-check.
-- Rows are loaded with supabase/seed/topics.sql.
--
-- tag_sermon_topics() applied the old rule, so it goes. New sermons are tagged
-- with scripts/tag-topics.py, which runs the same reader and rule.

drop function public.tag_sermon_topics();

comment on table public.sermon_topics is
  'One main topic per sermon, where the AI reader and the embedding match agree. Loaded by supabase/seed/topics.sql.';
comment on column public.sermon_topics.score is
  'How strongly the sermon matches the topic (embedding similarity standardised per topic). Higher is better.';
comment on table public.topic_vectors is
  'Each topic''s match text and embedding, with the catalogue''s mean and spread, for scoring sermons.';
