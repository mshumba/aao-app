-- Sign in with Apple token revocation (App Store guideline 5.1.1(v)).
-- Apple asks apps that offer Sign in with Apple to revoke the viewer's Apple
-- tokens when they delete their account. After each native sign-in the
-- apple-tokens Edge Function swaps Apple's one-time authorization code for a
-- refresh token and keeps it here. Deleting the account revokes it with Apple
-- (https://appleid.apple.com/auth/revoke) first, then removes the row. See
-- docs/development/apple-token-revocation.md.
--
-- Only the service role (the Edge Function) can reach this table. The app
-- can't read or write it: anon and authenticated have no grants and there are
-- no policies.

create table public.apple_tokens (
  id bigint generated always as identity primary key,
  -- Null once the account is gone: a token still to be revoked. This happens
  -- when Apple couldn't be reached during the deletion, or the account was
  -- deleted another way (the dashboard, an older app build). The function
  -- retries these on a back-off until Apple confirms, so a deletion never
  -- waits on Apple.
  user_id uuid unique references auth.users (id) on delete set null,
  -- The App ID (bundle ID) or Services ID Apple issued the token to. Revoking
  -- it needs the same one.
  client_id text not null check (char_length(client_id) between 1 and 255),
  refresh_token text not null check (char_length(refresh_token) between 1 and 2048),
  -- Failed revocations: how many, the last error (Apple's error code, never
  -- a token) and when to try again.
  attempts integer not null default 0,
  last_error text check (char_length(last_error) <= 200),
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index apple_tokens_pending_idx
  on public.apple_tokens (next_attempt_at nulls first)
  where user_id is null;

alter table public.apple_tokens enable row level security;

revoke all on public.apple_tokens from anon, authenticated;
grant select, insert, update, delete on public.apple_tokens to service_role;

create trigger apple_tokens_touch_updated_at
  before update on public.apple_tokens
  for each row execute function public.touch_updated_at();

-- Tokens of deleted accounts that are due another try, oldest first (at most
-- 50). Each is held for ten minutes, so two runs never try the same token at
-- once and a run that dies part-way is picked up again.
create function public.apple_tokens_due(max_rows integer)
returns table (id bigint, client_id text, refresh_token text)
language sql
set search_path = ''
as $$
  with due as (
    select t.id
    from public.apple_tokens t
    where t.user_id is null
      and (t.next_attempt_at is null or t.next_attempt_at <= pg_catalog.now())
    order by t.next_attempt_at nulls first, t.id
    limit least(greatest(coalesce(max_rows, 0), 0), 50)
    for update skip locked
  )
  update public.apple_tokens t
  set next_attempt_at = pg_catalog.now() + interval '10 minutes'
  from due
  where t.id = due.id
  returning t.id, t.client_id, t.refresh_token;
$$;

revoke execute on function public.apple_tokens_due(integer) from public, anon, authenticated;
grant execute on function public.apple_tokens_due(integer) to service_role;

-- A revocation that failed: count it, keep the reason, and wait longer each
-- time before the next try (2, 4, 8 … minutes, at most a day).
create function public.apple_tokens_failed(row_id bigint, reason text)
returns void
language sql
set search_path = ''
as $$
  update public.apple_tokens
  set attempts = attempts + 1,
      last_error = left(reason, 200),
      next_attempt_at = pg_catalog.now()
        + least(interval '1 minute' * power(2, least(attempts + 1, 11)), interval '1 day')
  where id = row_id;
$$;

revoke execute on function public.apple_tokens_failed(bigint, text) from public, anon, authenticated;
grant execute on function public.apple_tokens_failed(bigint, text) to service_role;

comment on function public.delete_account() is
  'Deletes the caller''s own account. Their profile, saved sermons, watch progress and path progress cascade with it. A Sign in with Apple token the app did not get revoked first stays in apple_tokens, without the account, until the apple-tokens function revokes it.';
