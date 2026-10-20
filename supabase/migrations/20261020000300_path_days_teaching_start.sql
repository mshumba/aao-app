-- Where each path or series day starts playing. The owner decided that paths
-- and series play the whole sermon from where the Apostle starts preaching,
-- after the worship, announcements and opening prayer. teaching_start is that
-- point in seconds, taken from the sermon's card (public.sermon_cards
-- .preaching_start, read from the whole transcript). Null means play from the
-- beginning.
--
-- focus_start, focus_end and the key moment (key_at, key_title, key_quote)
-- stay as data: they mark where the day's teaching sits and its key line.
--
-- Read by everyone like the rest of path_days (select is granted on the
-- table, so the new column is readable too). Filled by
-- supabase/seed/paths.sql and supabase/seed/series.sql.

alter table public.path_days
  add column teaching_start real check (teaching_start >= 0);

comment on column public.path_days.teaching_start is
  'Seconds into the video where the Apostle starts preaching; the day plays from here. Null: from the beginning.';
