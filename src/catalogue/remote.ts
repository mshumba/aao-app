import { SERMON_COLUMNS, type Changes, type SeriesRecord, type SermonRecord } from "./records";
import { CatalogueError, type Remote } from "./sync";

/**
 * Reads the catalogue from Supabase's REST API with the public key. The
 * tables are readable by everyone and written by nobody (see
 * supabase/migrations/20261014200000_sermon_catalogue.sql), so this needs no
 * session and stays apart from the account client.
 */

// Supabase returns at most 1,000 rows a request.
const PAGE = 1000;
/**
 * The whole library is about 2,850 sermons (295 KB compressed): seconds on a
 * slow phone connection, shared with the app's fonts. On a first visit the
 * newest sermons come first, alone (about 20 KB), so Home can show them
 * while the rest arrive, all at once.
 */
export const NEWEST = 200;
const TIMEOUT_MS = 20_000;

const SERMONS = [...SERMON_COLUMNS, "updated_at"].join(",");

type Row = Record<string, unknown> & { updated_at?: string };

export function createRemote(config: { url: string; key: string }): Remote {
  const base = `${config.url.replace(/\/+$/, "")}/rest/v1`;

  async function get(path: string, extra: Record<string, string> = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/${path}`, {
        headers: { apikey: config.key, Accept: "application/json", ...extra },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new CatalogueError(`Catalogue request failed (${response.status})`, "http", response.status);
      return { rows: (await response.json()) as Row[], range: response.headers.get("content-range") };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Every row of a query (which sets a stable order): the first `first` rows
   * with the count, handed to `onFirst` when more are to come, then the rest
   * a page at a time, all together.
   */
  async function all(query: string, first = PAGE, onFirst?: (rows: Row[]) => void) {
    const head = await get(`${query}&limit=${first}&offset=0`, { Prefer: "count=exact" });
    const total = Number(head.range?.split("/")[1]);
    const more = Number.isFinite(total) ? total > head.rows.length : head.rows.length === first;
    if (!more) return head.rows;
    onFirst?.(head.rows);
    let rows = head.rows;
    if (Number.isFinite(total)) {
      const offsets: number[] = [];
      for (let offset = head.rows.length; offset < total; offset += PAGE) offsets.push(offset);
      const pages = await Promise.all(
        offsets.map((offset) => get(`${query}&limit=${PAGE}&offset=${offset}`)),
      );
      rows = rows.concat(...pages.map((page) => page.rows));
    } else {
      // No count from the server: keep reading until a short page.
      for (let offset = head.rows.length; ; offset += PAGE) {
        const page = await get(`${query}&limit=${PAGE}&offset=${offset}`);
        rows = rows.concat(page.rows);
        if (page.rows.length < PAGE) break;
      }
    }
    return rows;
  }

  const strip = <T,>({ updated_at: _updated, ...rest }: Row) => rest as T;
  // A row published while the pages were read shifts the later ones by a
  // place, so one can come twice: keep each once.
  const sermonsOf = (rows: Row[]) => [
    ...new Map(rows.map((row) => [row.youtube_id, strip<SermonRecord>(row)])).values(),
  ];
  const seriesOf = (rows: Row[]) => rows.map((row) => strip<SeriesRecord>(row));

  /**
   * The catalogue's newest updated_at, asked for before any rows: the next
   * sync's cursor. A row that changes while the rows are read is newer than
   * it, so the next sync brings it again (replacing this copy's by id). The
   * newest updated_at among the rows read is no cursor: a sermon on a page
   * already read, corrected at 10:01, was skipped until the weekly whole
   * fetch once a row read after it had changed at 10:02. Supabase's clock,
   * never the device's.
   */
  async function newestChange() {
    const tables = await Promise.all(
      ["sermons", "series"].map((table) =>
        get(`${table}?select=updated_at&order=updated_at.desc&limit=1`),
      ),
    );
    return (
      tables
        .flatMap(({ rows }) => rows.map((row) => row.updated_at))
        .filter((t): t is string => typeof t === "string")
        .sort()
        .pop() ?? null
    );
  }

  /** Sermons and series changed after `since` ("changed since" compares updated_at). */
  async function fetchChanges(since: string): Promise<Changes> {
    const stamp = await newestChange();
    // Nothing newer than the copy: no rows to ask for. (Supabase writes every
    // timestamp alike, in UTC, so they compare as text.)
    if (!stamp || stamp <= since) return { sermons: [], series: [], syncedAt: since };
    const filter = `&updated_at=gt.${encodeURIComponent(since)}`;
    const [sermonRows, seriesRows] = await Promise.all([
      all(`sermons?select=${SERMONS}${filter}&order=youtube_id`),
      all(`series?select=key,name,updated_at${filter}&order=key`),
    ]);
    return { sermons: sermonsOf(sermonRows), series: seriesOf(seriesRows), syncedAt: stamp };
  }

  /**
   * The whole catalogue, newest sermons first. `onNewest` gets the first
   * NEWEST sermons (and every series) while the rest are still coming.
   */
  async function fetchAll(onNewest?: (newest: Changes) => void): Promise<Changes> {
    const stamp = await newestChange();
    const series = all("series?select=key,name,updated_at&order=key");
    // Tell the caller only once the series' names are in too; a failure is
    // the whole fetch's.
    series.catch(() => {});
    const sermonRows = await all(
      `sermons?select=${SERMONS}&order=published_at.desc,youtube_id`,
      NEWEST,
      onNewest &&
        ((rows) => {
          series.then(
            (seriesRows) =>
              onNewest({ sermons: sermonsOf(rows), series: seriesOf(seriesRows), syncedAt: null }),
            () => {},
          );
        }),
    );
    const seriesRows = await series;
    return { sermons: sermonsOf(sermonRows), series: seriesOf(seriesRows), syncedAt: stamp };
  }

  return { fetchAll, fetchChanges };
}
