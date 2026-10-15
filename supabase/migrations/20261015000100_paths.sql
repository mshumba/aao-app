-- Guided paths: ministry-ordered series of 5-7 days. Each day is one sermon
-- plus a 10-20 minute focus segment inside it, with one key moment (a short
-- verbatim quote from the auto-captions, punctuated) to play from.
--
-- paths and path_days are read by everyone (guests included); drafts are
-- readable too and the app labels them until the ministry publishes them.
-- Nobody writes them through the API: rows are loaded with
-- supabase/seed/paths.sql (service role / SQL editor).
--
-- path_enrollments and path_day_done hold each viewer's own progress. Row
-- level security limits every row to its owner, and both cascade from
-- auth.users, so delete_account() removes them with the account.
--
-- Grants are explicit because "Automatically expose new tables" is off.

-- Paths -----------------------------------------------------------------------

create table public.paths (
  id text primary key
    check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 80),
  name text not null check (char_length(name) between 1 and 120),
  -- The 1-3 word phrase of the name that the app sets in italics.
  italic text not null
    check (char_length(italic) between 1 and 60 and strpos(name, italic) > 0),
  promise text not null check (char_length(promise) between 1 and 200),
  why text not null check (char_length(why) between 1 and 1000),
  -- needs.id slugs this path answers ("What are you going through?").
  needs text[] not null default '{}',
  minutes_per_day integer not null check (minutes_per_day between 1 and 60),
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index paths_sort_idx on public.paths (sort);

alter table public.paths enable row level security;

revoke all on public.paths from anon, authenticated;
grant select on public.paths to anon, authenticated;
grant select, insert, update, delete on public.paths to service_role;

create policy "Anyone reads paths"
  on public.paths for select to anon, authenticated
  using (true);

create trigger paths_touch_updated_at
  before update on public.paths
  for each row execute function public.touch_updated_at();

-- Path days -------------------------------------------------------------------

create table public.path_days (
  path_id text not null references public.paths (id) on update cascade on delete cascade,
  day integer not null check (day between 1 and 30),
  -- A sermon in the catalogue. Sermons are never deleted by the importer;
  -- restrict so a path can't silently lose a day.
  youtube_id text not null
    references public.sermons (youtube_id) on update cascade on delete restrict,
  -- Seconds into the video.
  focus_start real not null check (focus_start >= 0),
  focus_end real not null,
  -- Our editorial line for the day (not a quote), up to about 8 words.
  theme text not null check (char_length(theme) between 1 and 80),
  -- Where to start playing the key moment: about 3 s before the quote.
  key_at real not null check (key_at >= 0),
  key_title text not null check (char_length(key_title) between 1 and 60),
  -- A contiguous verbatim span of the captions; only capitalisation and
  -- punctuation are added.
  key_quote text not null check (char_length(key_quote) between 1 and 400),
  primary key (path_id, day),
  check (focus_end > focus_start)
);

create index path_days_youtube_id_idx on public.path_days (youtube_id);

alter table public.path_days enable row level security;

revoke all on public.path_days from anon, authenticated;
grant select on public.path_days to anon, authenticated;
grant select, insert, update, delete on public.path_days to service_role;

create policy "Anyone reads path days"
  on public.path_days for select to anon, authenticated
  using (true);

-- Enrollments -----------------------------------------------------------------

create table public.path_enrollments (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  path_id text not null references public.paths (id) on update cascade on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (user_id, path_id),
  check (finished_at is null or finished_at >= started_at)
);

create index path_enrollments_path_id_idx on public.path_enrollments (path_id);

alter table public.path_enrollments enable row level security;

revoke all on public.path_enrollments from anon, authenticated;
grant select, insert, update, delete on public.path_enrollments to authenticated;

create policy "Viewers read their path enrollments"
  on public.path_enrollments for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Viewers start paths"
  on public.path_enrollments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Viewers update their path enrollments"
  on public.path_enrollments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Viewers leave paths"
  on public.path_enrollments for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Days done -------------------------------------------------------------------
-- Keyed by path and day number (not a foreign key to path_days), so editing a
-- path's days never wipes anyone's progress.

create table public.path_day_done (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  path_id text not null references public.paths (id) on update cascade on delete cascade,
  day integer not null check (day between 1 and 30),
  done_at timestamptz not null default now(),
  primary key (user_id, path_id, day)
);

create index path_day_done_path_id_idx on public.path_day_done (path_id);

alter table public.path_day_done enable row level security;

revoke all on public.path_day_done from anon, authenticated;
grant select, insert, update, delete on public.path_day_done to authenticated;

create policy "Viewers read their days done"
  on public.path_day_done for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Viewers mark days done"
  on public.path_day_done for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Viewers update their days done"
  on public.path_day_done for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Viewers unmark days done"
  on public.path_day_done for delete to authenticated
  using ((select auth.uid()) = user_id);

-- delete_account() deletes the auth user; enrollments and days done cascade
-- with the profile, saved sermons and watch progress.
comment on function public.delete_account() is
  'Deletes the caller''s own account. Their profile, saved sermons, watch progress and path progress cascade with it.';
