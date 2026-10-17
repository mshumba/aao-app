-- Topics: the 8 subjects people pick when they join, chosen by AI from what
-- Apostle Arome Osayi teaches and approved by the owner on 16 Oct 2026 ("pick
-- 8 using ai ... it will help us in suggesting paths"). Each topic lists the
-- needs and guided paths it suggests, and sermon_topics tags every sermon that
-- has a transcript with one to three topics.
--
-- How a sermon is tagged: its passages are averaged into one vector and
-- compared with each topic's match text (text-embedding-3-large, 768
-- dimensions, like the passages). Each topic's scores are standardised (z)
-- against the whole catalogue so broad topics don't swallow it. A sermon keeps
-- its best topic, plus up to two more with z >= 1 that are within 0.6 of its
-- best. topic_vectors keeps the vectors and the catalogue's mean and spread,
-- frozen when the topics were loaded, so tag_sermon_topics() tags sermons that
-- arrive later on the same scale.
--
-- Everyone (guests included) reads topics and sermon_topics; topic_vectors
-- and tag_sermon_topics() are for the service role only. Rows are loaded with
-- supabase/seed/topics.sql.

create table public.topics (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 64),
  label text not null check (char_length(label) between 1 and 40),
  -- One line under the label in the picker.
  description text not null check (char_length(description) between 1 and 120),
  -- The needs (public.needs ids) and guided paths (public.paths ids) this
  -- topic suggests, most fitting first.
  need_ids text[] not null default '{}',
  path_ids text[] not null default '{}',
  sort integer not null,
  created_at timestamptz not null default now()
);

alter table public.topics enable row level security;

revoke all on public.topics from anon, authenticated;
grant select on public.topics to anon, authenticated;
grant select, insert, update, delete on public.topics to service_role;

create policy "Anyone reads topics"
  on public.topics for select to anon, authenticated
  using (true);

create table public.sermon_topics (
  youtube_id text not null
    references public.sermons (youtube_id) on update cascade on delete cascade,
  topic_id text not null
    references public.topics (id) on update cascade on delete cascade,
  -- 1 for the sermon's main topic, then 2 and 3.
  rank smallint not null check (rank between 1 and 3),
  -- How strongly the sermon matches the topic, standardised per topic (z).
  score real not null,
  primary key (youtube_id, topic_id)
);

-- A topic's sermons, best match first.
create index sermon_topics_topic_score_idx on public.sermon_topics (topic_id, score desc);

alter table public.sermon_topics enable row level security;

revoke all on public.sermon_topics from anon, authenticated;
grant select on public.sermon_topics to anon, authenticated;
grant select, insert, update, delete on public.sermon_topics to service_role;

create policy "Anyone reads sermon topics"
  on public.sermon_topics for select to anon, authenticated
  using (true);

create table public.topic_vectors (
  topic_id text primary key
    references public.topics (id) on update cascade on delete cascade,
  -- The text that was embedded: the topic's working label and a description
  -- of the teaching it covers.
  match_text text not null,
  embedding extensions.halfvec(768) not null,
  -- Cosine similarity of every tagged sermon to this topic when it was loaded.
  mean real,
  sd real check (sd > 0)
);

alter table public.topic_vectors enable row level security;

revoke all on public.topic_vectors from anon, authenticated;
grant select, insert, update, delete on public.topic_vectors to service_role;

-- Tags every sermon that has passages and no topics yet. Returns how many
-- sermons it tagged. plpgsql so the body is only resolved when it runs.
create function public.tag_sermon_topics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tagged integer;
begin
  with todo as (
    select p.youtube_id, extensions.avg(p.embedding::extensions.vector(768)) as v
    from public.passages p
    where p.dup_of is null
      and not coalesce(p.hidden_from_search, false)
      and not exists (
        select 1 from public.sermon_topics st where st.youtube_id = p.youtube_id
      )
    group by p.youtube_id
  ),
  scored as (
    select t.youtube_id, tv.topic_id,
      ((1 - (t.v operator(extensions.<=>) tv.embedding::extensions.vector(768))) - tv.mean)
        / tv.sd as z
    from todo t
    cross join public.topic_vectors tv
    where tv.mean is not null and tv.sd is not null
  ),
  ranked as (
    select youtube_id, topic_id, z,
      row_number() over (partition by youtube_id order by z desc) as rn,
      max(z) over (partition by youtube_id) as best
    from scored
  ),
  added as (
    insert into public.sermon_topics (youtube_id, topic_id, rank, score)
    select youtube_id, topic_id, rn, z
    from ranked
    where rn = 1 or (rn <= 3 and z >= 1 and z >= best - 0.6)
    returning youtube_id
  )
  select count(distinct youtube_id) into tagged from added;
  return tagged;
end;
$$;

revoke all on function public.tag_sermon_topics() from public, anon, authenticated;
grant execute on function public.tag_sermon_topics() to service_role;
