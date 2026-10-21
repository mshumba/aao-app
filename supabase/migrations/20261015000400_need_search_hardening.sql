-- Hardening after the security review of need-based search (migrations
-- need_search and passages_hnsw). Nothing here changes what the app or the
-- Edge Functions can read or write.
--
-- 1. The two quote-check trigger functions kept PostgreSQL's default EXECUTE
--    for PUBLIC. A trigger function can't be called directly, so this was not
--    reachable, but every other function in public names its callers
--    explicitly; these now do too. Triggers still fire for any role that may
--    write the table (only service_role may).
-- 2. search_hits had no primary key (performance advisor 0004). An identity
--    column gives each hit one. search_rate_ok() inserts only `key`, and
--    identity columns need no sequence grant, so the rate limit is unchanged.

revoke execute on function public.moments_check_quote() from public, anon, authenticated;
revoke execute on function public.passage_quotes_check() from public, anon, authenticated;

alter table public.search_hits
  add column id bigint generated always as identity primary key;
