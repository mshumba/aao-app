-- Watch progress: where each viewer stopped in each sermon, so a sermon can
-- resume where they left off and Home can offer "Continue watching".
-- Same rules as the accounts migration: row level security limits every row
-- to its owner, and grants are explicit (automatic exposure is off).

create table public.watch_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The app's catalogue ID for the sermon (its YouTube video ID).
  sermon_id text not null check (char_length(sermon_id) between 1 and 64),
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  -- Watched to (or near) the end; finished sermons start from the beginning.
  finished boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, sermon_id)
);

alter table public.watch_progress enable row level security;

-- Saved with an upsert (insert, or update the existing row); never deleted
-- by the app, only with the account.
revoke all on public.watch_progress from anon, authenticated;
grant select, insert, update on public.watch_progress to authenticated;

create policy "Viewers read their watch progress"
  on public.watch_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Viewers record their watch progress"
  on public.watch_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Viewers update their watch progress"
  on public.watch_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The server's clock orders "Continue watching", not the device's.
create trigger watch_progress_touch_updated_at
  before update on public.watch_progress
  for each row execute function public.touch_updated_at();

-- delete_account() removes the auth user; watch progress now cascades with
-- the profile and saved sermons.
comment on function public.delete_account() is
  'Deletes the caller''s own account. Their profile, saved sermons and watch progress cascade with it.';
