-- Meaning index for need-based search. Applied after the passages are bulk
-- loaded (building an HNSW index once is much faster than growing it row by
-- row). It covers only the passages search can return (not near-copies from
-- other uploads, not fragments under 120 words); match_passages() filters on
-- exactly this condition so Postgres uses it.
--
-- About 100k vectors of 768 dimensions at half precision: roughly 190 MB of
-- index. The build gets enough memory to keep the graph in RAM (much faster
-- than an on-disk build) and may run past the default statement timeout. It
-- runs without parallel workers: a parallel build keeps the graph in shared
-- memory, which is too small on the smaller compute sizes ("could not resize
-- shared memory segment").

set local max_parallel_maintenance_workers = 0;
set local maintenance_work_mem = '256MB';
set local statement_timeout = '30min';

create index if not exists passages_embedding_hnsw
  on public.passages
  using hnsw (embedding extensions.halfvec_cosine_ops)
  where dup_of is null and words >= 120;

analyze public.passages;
