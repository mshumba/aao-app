-- A read-only database login for helper agents (Argon, Astra and other AI
-- reviewers), so they can study the whole sermon library, transcripts
-- included, without admin keys. Approved by the owner on 16 Oct 2026 ("create
-- a read-only library login for the helpers (content tables only, no user
-- data)").
--
-- It reads content tables only. It can't read viewers' data (profiles, saved
-- sermons, progress, path enrolments, searches) or anything in auth or
-- storage. It can't write or run functions that write. It bypasses row level
-- security, so it also sees drafts the app hides, but only on the tables
-- granted below.
--
-- The role is created here without a login. The coordinator turns the login
-- on with a password out of band (alter role library_reader login password
-- ...), so the password never reaches git. The connection string lives in the
-- git-ignored .env.helpers. To shut it off: alter role library_reader nologin.

create role library_reader nologin noinherit bypassrls connection limit 5;

alter role library_reader set default_transaction_read_only = on;
alter role library_reader set statement_timeout = '60s';
alter role library_reader set idle_in_transaction_session_timeout = '60s';
alter role library_reader set search_path = public, extensions;

grant usage on schema public, extensions to library_reader;

grant select on
  public.sermons,
  public.series,
  public.passages,
  public.passage_quotes,
  public.moments,
  public.needs,
  public.paths,
  public.path_days,
  public.topics,
  public.sermon_topics,
  public.topic_vectors,
  public.blessings
to library_reader;
