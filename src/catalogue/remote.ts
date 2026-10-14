import { SERMON_COLUMNS, type Changes, type SeriesRecord, type SermonRecord } from "./records";
import type { Remote } from "./sync";

/**
 * Reads the catalogue from Supabase's REST API with the public key. The
 * tables are readable by everyone and written by nobody (see
 * supabase/migrations/20261014200000_sermon_catalogue.sql), so this needs no
 * session and stays apart from the account client.
 */

// Supabase returns at most 1,000 rows a request.
const PAGE = 1000;
const TIMEOUT_MS = 20_000;

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
      if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
      return { rows: (await response.json()) as Row[], range: response.headers.get("content-range") };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Every row of a query, a page at a time (later pages together). */
  async function all(table: string, select: string, filter: string) {
    const query = `${table}?select=${select}${filter}`;
    const first = await get(`${query}&limit=${PAGE}&offset=0`, { Prefer: "count=exact" });
    const total = Number(first.range?.split("/")[1]);
    const offsets: number[] = [];
    if (Number.isFinite(total))
      for (let offset = PAGE; offset < total; offset += PAGE) offsets.push(offset);
    const rest = await Promise.all(
      offsets.map((offset) => get(`${query}&limit=${PAGE}&offset=${offset}`)),
    );
    let rows = first.rows.concat(...rest.map((page) => page.rows));
    // No count from the server: keep reading until a short page.
    if (!Number.isFinite(total) && first.rows.length === PAGE) {
      for (let offset = PAGE; ; offset += PAGE) {
        const page = await get(`${query}&limit=${PAGE}&offset=${offset}`);
        rows = rows.concat(page.rows);
        if (page.rows.length < PAGE) break;
      }
    }
    return rows;
  }

  async function fetchSince(since: string | null): Promise<Changes> {
    // Stable order across pages; "changed since" compares updated_at.
    const filter = since ? `&updated_at=gt.${encodeURIComponent(since)}` : "";
    const [sermonRows, seriesRows] = await Promise.all([
      all("sermons", [...SERMON_COLUMNS, "updated_at"].join(","), `${filter}&order=youtube_id`),
      all("series", "key,name,updated_at", `${filter}&order=key`),
    ]);
    const stamps = [...sermonRows, ...seriesRows]
      .map((row) => row.updated_at)
      .filter((t): t is string => typeof t === "string")
      .sort();
    const strip = <T,>({ updated_at: _updated, ...rest }: Row) => rest as T;
    return {
      sermons: sermonRows.map((row) => strip<SermonRecord>(row)),
      series: seriesRows.map((row) => strip<SeriesRecord>(row)),
      syncedAt: stamps.pop() ?? since,
    };
  }

  return {
    fetchAll: () => fetchSince(null),
    fetchChanges: (since) => fetchSince(since),
  };
}
