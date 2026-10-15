-- Teaching series: ordered teachings that build understanding step by step
-- (foundation, truth, practice, maturity). Each teaching is one sermon plus a
-- 15-30 minute focus segment and one key moment, exactly like a path day.
--
-- Series live in the same tables as the guided paths: one public.paths row per
-- series and one public.path_days row per teaching (day = teaching number), so
-- enrolment, progress and the Paths tab work unchanged. kind tells the app
-- which is which: 'path' is a need-based guided path, 'series' a teaching
-- series. Existing rows become 'path' through the default.
--
-- Row level security, policies and grants on public.paths are unchanged:
-- anon and authenticated read every row (select is granted on the table, so
-- the new column is readable too); only the service role writes. Rows are
-- loaded with supabase/seed/series.sql.

alter table public.paths
  add column kind text not null default 'path'
    check (kind in ('path', 'series'));

comment on column public.paths.kind is
  'path: a need-based guided path. series: a teaching series (one path_days row per teaching).';
