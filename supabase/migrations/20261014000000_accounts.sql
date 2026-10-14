-- AAO accounts: profiles, saved sermons and self-service account deletion.
-- Apply once to a new Supabase project (SQL editor, or `supabase db push`).
-- Every table has row level security; a signed-in viewer can only read and
-- change their own rows. Sermon IDs are the app's stable catalogue IDs.
-- Grants are explicit, so this works with "Automatically expose new tables"
-- turned off (Supabase's recommendation): each table exposes only what the
-- app uses, to the roles that use it.

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  -- Edification topic IDs chosen during onboarding (src/data/categories.ts).
  interests text[] not null default '{}'
    check (cardinality(interests) <= 20),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

create policy "Viewers read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Viewers create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Viewers update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A profile row for every new account, named from Apple/Google when given.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(
      left(
        coalesce(
          new.raw_user_meta_data ->> 'display_name',
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name'
        ),
        80
      ),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Saved sermons --------------------------------------------------------------

create table public.saved_sermons (
  user_id uuid not null references auth.users (id) on delete cascade,
  sermon_id text not null check (char_length(sermon_id) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (user_id, sermon_id)
);

alter table public.saved_sermons enable row level security;

revoke all on public.saved_sermons from anon, authenticated;
grant select, insert, delete on public.saved_sermons to authenticated;

create policy "Viewers read their saved sermons"
  on public.saved_sermons for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Viewers save sermons"
  on public.saved_sermons for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Viewers unsave sermons"
  on public.saved_sermons for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Account deletion (App Store guideline 5.1.1(v)) ---------------------------
-- Deletes the caller's auth user; profiles and saved sermons cascade.

create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- Remote app settings ---------------------------------------------------------
-- Read by everyone (including guests); changed only from the dashboard.
-- guest_watch: "shared" (guests watch only sermons opened from a shared link),
-- "all" (guests watch everything) or "none". Flip it here, no new build needed.

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;

create policy "Anyone reads app settings"
  on public.app_settings for select to anon, authenticated
  using (true);

insert into public.app_settings (key, value)
values ('guest_watch', '"shared"');
