-- When each sermon's own video is ready to stream from R2 (HLS at
-- https://audio.aaolearning.com/video/<youtube_id>/master.m3u8, uploaded by
-- the video pipeline in the Curated Sermons project). Null until then.
--
-- The owner asked to hide sermons that aren't on R2 yet while the library
-- uploads (21 Oct 2026: "Can we try to hide non r2 videos while I download
-- them"). Apps from version 0.2.0, which play from R2, list only sermons
-- with video_ready_at set. The video-ready Edge Function sets it: a pg_cron
-- job calls it every 10 minutes, and it checks each sermon still marked not
-- ready for its playlist. Setting it touches updated_at, so apps pick the
-- change up with their next catalogue sync.
--
-- Readable like the rest of public.sermons; only the service role writes.
-- The catalogue importers name their columns, so they never reset it.

alter table public.sermons add column video_ready_at timestamptz;

comment on column public.sermons.video_ready_at is
  'When this sermon''s HLS video was found on R2; null until it is. Set by the video-ready function.';

create index sermons_video_unready_idx on public.sermons (published_at desc) where video_ready_at is null;
