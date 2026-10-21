-- Supabase's "Enable automatic RLS" project option adds an event-trigger
-- helper, public.rls_auto_enable(). It runs on DDL, never from the API, so
-- the API roles needn't be able to call it (Supabase's security advisor
-- flags it otherwise). Skipped on projects created without that option.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
