#!/usr/bin/env node
/**
 * Guided paths and teaching series: one JSON file each in content/paths/, the only place
 * they are written. `sql` prints the SQL that loads them into the library (the owner says when).
 *
 *   node scripts/paths.mjs needs                                the needs viewers pick, and which have a path
 *   node scripts/paths.mjs find <words…> [--all] [--limit N]   sermons whose title or card match every word
 *   node scripts/paths.mjs sermon <youtube_id>                  one sermon: length, preaching start, card
 *   node scripts/paths.mjs transcript <youtube_id> [from] [to]  its transcript with times (seconds or h:mm:ss)
 *   node scripts/paths.mjs used                                 which sermons the paths already use
 *   node scripts/paths.mjs check [files…] [--offline]           checks paths against the rules and the library
 *   node scripts/paths.mjs ready                                may this branch's path PR merge itself? (the gate)
 *   node scripts/paths.mjs sql [ids…]                           the SQL that loads these paths (default: all)
 *
 * The library commands, and check without --offline, read the sermon library through the read-only
 * login AAO_LIBRARY_DB_URL. It is taken from the environment, else from .env.helpers in this folder
 * or in the main checkout (so it works from a git worktree without copying the file). Never print it.
 * The guide is docs/development/paths.md.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "content/paths");
const NEEDS_SEED = path.join(ROOT, "supabase/seed/needs.sql");
const MAX_SECONDS = 3 * 3600; // owner, 16 Oct 2026: no sermon over 3 hours in a path or series
const DEFAULT_SORT = 90;
const APOSTLE = ["Apostle Arome Osayi", "Dr. Arome Osayi"]; // how the sermon cards name him
const PATH_KEYS = ["id", "kind", "name", "italic", "promise", "why", "needs", "minutes_per_day", "sort", "days"];
const DAY_KEYS = ["youtube_id", "theme", "focus_start", "focus_end", "key_at", "key_title", "key_quote", "teaching_start"];

// ---------- small helpers ----------

function die(message) {
  console.error(message);
  process.exit(1);
}

function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function seconds(text) {
  if (text === undefined) return undefined;
  const parts = String(text).split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) die(`Not a time: ${text} (use seconds or h:mm:ss)`);
  return parts.reduce((total, n) => total * 60 + n, 0);
}

function readPaths(files) {
  const names = files?.length ? files : fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  return names.map((name) => {
    const file = path.isAbsolute(name) || name.includes("/") ? path.resolve(name) : path.join(DIR, name);
    try {
      return { file, path: JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch (error) {
      return { file, error: `not valid JSON: ${error.message}` };
    }
  });
}

function knownNeeds() {
  const text = fs.readFileSync(NEEDS_SEED, "utf8");
  return new Set([...text.matchAll(/^\s*\('([a-z0-9-]+)',/gm)].map((m) => m[1]));
}

// ---------- the library (read-only login) ----------

function libraryUrl() {
  if (process.env.AAO_LIBRARY_DB_URL) return process.env.AAO_LIBRARY_DB_URL;
  let main = ROOT;
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" });
    main = path.dirname(common.trim());
  } catch {
    // not a git checkout: only this folder is searched
  }
  for (const dir of [ROOT, main]) {
    const file = path.join(dir, ".env.helpers");
    if (fs.existsSync(file)) {
      process.loadEnvFile(file);
      break;
    }
  }
  return process.env.AAO_LIBRARY_DB_URL;
}

async function library() {
  const url = libraryUrl();
  if (!url) die("No library login. Ask the owner for the read-only AAO_LIBRARY_DB_URL (.env.helpers), or run check --offline.");
  const { default: pg } = await import("pg");
  const conn = new URL(url);
  conn.searchParams.delete("sslmode"); // the pooler needs TLS; set below without CA pinning, as libpq's sslmode=require does
  const client = new pg.Client({ connectionString: conn.toString(), ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (error) {
    die(`Could not reach the library: ${error.message}`);
  }
  return client;
}

async function query(client, sql, params = []) {
  try {
    return (await client.query(sql, params)).rows;
  } catch (error) {
    die(`Library query failed: ${error.message}`);
  }
}

// ---------- quotes: verbatim against the stored transcript ----------

const FILLERS = new Set(["uh", "um", "er", "erm", "ah"]);

/** Lower case, letters and digits only, fillers out, an immediate repeat of 1-3 words said once. */
function words(text) {
  const raw = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/'/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLERS.has(w));
  const out = [];
  for (const w of raw) {
    out.push(w);
    for (let n = 3; n >= 1; n--) {
      const k = out.length;
      if (k >= 2 * n && out.slice(k - n).join(" ") === out.slice(k - 2 * n, k - n).join(" ")) {
        out.length = k - n;
        break;
      }
    }
  }
  return out;
}

/** Passages overlap by about 15%; join them without repeating the shared words. */
function joined(passages) {
  let all = [];
  for (const p of passages) {
    const next = words(p.text);
    let overlap = 0;
    for (let k = Math.min(120, all.length, next.length); k > 0; k--) {
      if (all.slice(all.length - k).join(" ") === next.slice(0, k).join(" ")) {
        overlap = k;
        break;
      }
    }
    all = all.concat(next.slice(overlap));
  }
  return ` ${all.join(" ")} `;
}

function contains(passages, quote) {
  return joined(passages).includes(` ${words(quote).join(" ")} `);
}

// ---------- check ----------

function checkShape(entry, needs, seen) {
  const errors = [];
  const warnings = [];
  const p = entry.path;
  const text = (key, max) => {
    if (typeof p[key] !== "string" || !p[key].trim() || p[key].length > max) errors.push(`${key}: text of 1 to ${max} characters`);
  };
  if (!p || typeof p !== "object") return { errors: ["not a JSON object"], warnings };
  for (const key of Object.keys(p)) if (!PATH_KEYS.includes(key)) errors.push(`unknown field "${key}"`);
  if (typeof p.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id) || p.id.length > 80) errors.push("id: lower-case words joined by hyphens");
  else if (path.basename(entry.file) !== `${p.id}.json`) errors.push(`file must be named ${p.id}.json`);
  else if (seen.has(p.id)) errors.push("another file has this id");
  seen.add(p.id);
  if (!["path", "series"].includes(p.kind)) errors.push('kind: "path" or "series"');
  text("name", 120);
  text("italic", 60);
  if (typeof p.name === "string" && typeof p.italic === "string" && !p.name.includes(p.italic)) errors.push("italic must be part of name");
  text("promise", 200);
  text("why", 1000);
  if (!Array.isArray(p.needs)) errors.push("needs: a list of need ids");
  else {
    for (const n of p.needs) if (!needs.has(n)) errors.push(`needs: "${n}" is not in supabase/seed/needs.sql`);
    if (p.kind === "path" && p.needs.length === 0) errors.push("needs: a path answers at least one need");
  }
  if (!Number.isInteger(p.minutes_per_day) || p.minutes_per_day < 1 || p.minutes_per_day > 60) errors.push("minutes_per_day: a whole number from 1 to 60");
  if (p.sort !== undefined && !Number.isInteger(p.sort)) errors.push("sort: a whole number (or leave it out)");
  if (!Array.isArray(p.days) || p.days.length < 1 || p.days.length > 30) {
    errors.push("days: a list of 1 to 30 days");
    return { errors, warnings };
  }
  const ids = new Set();
  p.days.forEach((d, i) => {
    const at = `day ${i + 1}`;
    if (!d || typeof d !== "object") return errors.push(`${at}: not an object`);
    for (const key of Object.keys(d)) if (!DAY_KEYS.includes(key)) errors.push(`${at}: unknown field "${key}"`);
    if (typeof d.youtube_id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(d.youtube_id)) errors.push(`${at}: youtube_id is 11 characters`);
    else if (ids.has(d.youtube_id)) errors.push(`${at}: ${d.youtube_id} is already an earlier day`);
    ids.add(d.youtube_id);
    for (const [key, max] of [["theme", 80], ["key_title", 60], ["key_quote", 400]]) {
      if (typeof d[key] !== "string" || !d[key].trim() || d[key].length > max) errors.push(`${at}: ${key} is text of 1 to ${max} characters`);
    }
    for (const key of ["focus_start", "focus_end", "key_at"]) {
      if (typeof d[key] !== "number" || d[key] < 0) errors.push(`${at}: ${key} is seconds (a number, 0 or more)`);
    }
    if (d.teaching_start !== undefined && (typeof d.teaching_start !== "number" || d.teaching_start < 0)) errors.push(`${at}: teaching_start is seconds, or leave it out`);
    if (d.focus_end <= d.focus_start) errors.push(`${at}: focus_end must be after focus_start`);
    if (d.key_at < d.focus_start - 30 || d.key_at > d.focus_end + 30) warnings.push(`${at}: key_at ${clock(d.key_at)} is outside the focus window`);
  });
  return { errors, warnings };
}

async function checkLibrary(client, entries, results) {
  const days = entries.flatMap((e, i) => (results[i].errors.length ? [] : e.path.days.map((d, n) => ({ i, n, d }))));
  if (!days.length) return;
  const ids = [...new Set(days.map((x) => x.d.youtube_id))];
  const rows = await query(
    client,
    `select s.youtube_id, s.title, s.duration_seconds, s.video_ready_at is not null as video_ready,
            c.preaching_start, c.preacher, c.kind
       from public.sermons s left join public.sermon_cards c using (youtube_id)
      where s.youtube_id = any($1)`,
    [ids],
  );
  const sermons = new Map(rows.map((r) => [r.youtube_id, r]));
  const usedBy = new Map();
  for (const { path: p } of readPaths()) for (const d of p?.days ?? []) usedBy.set(d.youtube_id, [...(usedBy.get(d.youtube_id) ?? []), p.id]);
  for (const { i, n, d } of days) {
    const r = results[i];
    const at = `day ${n + 1} (${d.youtube_id})`;
    const s = sermons.get(d.youtube_id);
    if (!s) {
      r.errors.push(`${at}: not a sermon in the library`);
      continue;
    }
    const length = Number(s.duration_seconds);
    if (length > MAX_SECONDS) r.errors.push(`${at}: ${clock(length)} long; no sermon over 3 hours`);
    if (d.focus_end > length + 5) r.errors.push(`${at}: focus_end ${clock(d.focus_end)} is past the end (${clock(length)})`);
    if (d.key_at > length) r.errors.push(`${at}: key_at ${clock(d.key_at)} is past the end (${clock(length)})`);
    if (!s.video_ready) r.warnings.push(`${at}: its video isn't on R2 yet, so it plays from YouTube`);
    if (!APOSTLE.includes(s.preacher)) r.warnings.push(`${at}: the card's preacher is ${s.preacher ?? "unknown"}`);
    if (["prayer_meeting", "worship"].includes(s.kind)) r.warnings.push(`${at}: the card says this is a ${s.kind.replace("_", " ")}`);
    const starts = d.teaching_start ?? (s.preaching_start === null ? null : Number(s.preaching_start));
    if (d.teaching_start !== undefined && s.preaching_start !== null && Math.abs(d.teaching_start - s.preaching_start) > 120) {
      r.warnings.push(`${at}: teaching_start ${clock(d.teaching_start)}, but the card's preaching starts at ${clock(s.preaching_start)}`);
    }
    if (starts !== null && d.key_at < starts - 5) r.warnings.push(`${at}: the key moment ${clock(d.key_at)} is before the day starts playing (${clock(starts)})`);
    const others = (usedBy.get(d.youtube_id) ?? []).filter((id) => id !== entries[i].path.id);
    if (others.length) r.warnings.push(`${at}: also used by ${others.join(", ")}`);
    const near = await query(
      client,
      "select start_s, end_s, text from public.passages where youtube_id = $1 and start_s <= $2 and end_s >= $3 order by start_s",
      [d.youtube_id, d.key_at + 240, d.key_at - 120],
    );
    if (contains(near, d.key_quote)) continue;
    const all = await query(client, "select start_s, end_s, text from public.passages where youtube_id = $1 order by start_s", [d.youtube_id]);
    const hit = all.find((p, k) => contains(all.slice(Math.max(0, k - 1), k + 2), d.key_quote));
    r.errors.push(
      hit
        ? `${at}: key_quote is in the transcript near ${clock(hit.start_s)}, not near key_at ${clock(d.key_at)}`
        : `${at}: key_quote isn't word for word in the transcript (only capitals, punctuation, uh/um and an immediate repeat may differ)`,
    );
  }
}

async function check(args, { exit = true } = {}) {
  const offline = args.includes("--offline");
  const files = args.filter((a) => !a.startsWith("--"));
  const entries = readPaths(files);
  const needs = knownNeeds();
  const seen = new Set();
  const results = entries.map((e) => (e.error ? { errors: [e.error], warnings: [] } : checkShape(e, needs, seen)));
  if (!offline) {
    const client = await library();
    try {
      await checkLibrary(client, entries, results);
    } finally {
      await client.end();
    }
  }
  let failed = 0;
  entries.forEach((e, i) => {
    const { errors, warnings } = results[i];
    const name = e.path?.id ?? path.basename(e.file);
    const days = Array.isArray(e.path?.days) ? e.path.days.length : 0;
    console.log(`${errors.length ? "✗" : "✓"} ${name}${days ? ` (${e.path.kind ?? "?"}, ${days} ${days === 1 ? "day" : "days"})` : ""}`);
    for (const m of errors) console.log(`    error: ${m}`);
    for (const m of warnings) console.log(`    warning: ${m}`);
    if (errors.length) failed++;
  });
  console.log(`\n${entries.length - failed} of ${entries.length} pass${offline ? " (offline: the library wasn't checked)" : ""}.`);
  if (failed && exit) process.exit(1);
  return failed;
}

// ---------- ready: may this branch's PR merge itself? ----------

const BASE = "claude/frontend-ux-pass";

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** The gate an agent passes before merging its own path PR: one new path file, synced, checked, pushed. */
async function ready() {
  const problems = [];
  try {
    git("fetch", "-q", "origin", BASE);
  } catch {
    die("Could not fetch origin.");
  }
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if ([BASE, "main", "HEAD"].includes(branch)) problems.push(`you're on ${branch}; work on your own path branch`);
  if (git("status", "--porcelain")) problems.push("there are uncommitted changes; commit your path file or remove them");
  try {
    git("merge-base", "--is-ancestor", `origin/${BASE}`, "HEAD");
  } catch {
    problems.push(`not up to date; run: git fetch origin && git rebase origin/${BASE}`);
  }
  const changed = git("diff", "--name-status", "--no-renames", `origin/${BASE}...HEAD`).split("\n").filter(Boolean).map((line) => line.split("\t"));
  const only = changed.length === 1 && changed[0][0] === "A" && /^content\/paths\/[a-z0-9-]+\.json$/.test(changed[0][1]);
  if (!only) {
    const list = changed.map(([status, file]) => `${status} ${file}`).join(", ") || "nothing";
    problems.push(`a path PR adds exactly one new file in content/paths/ and changes nothing else; this branch changes: ${list}`);
  }
  if (only && (await check([path.join(ROOT, changed[0][1])], { exit: false }))) problems.push("check found errors (above)");
  let pr = null;
  try {
    pr = JSON.parse(execFileSync("gh", ["pr", "view", "--json", "number,state,baseRefName,headRefOid,isDraft"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    problems.push("no PR for this branch yet; push it and open one into " + BASE);
  }
  if (pr) {
    if (pr.state !== "OPEN") problems.push(`PR #${pr.number} is ${pr.state.toLowerCase()}`);
    if (pr.baseRefName !== BASE) problems.push(`PR #${pr.number} targets ${pr.baseRefName}, not ${BASE}`);
    if (pr.headRefOid !== git("rev-parse", "HEAD")) problems.push("the PR doesn't have your latest commit; push (after a rebase: git push --force-with-lease)");
    if (pr.isDraft) problems.push(`PR #${pr.number} is a draft; mark it ready (gh pr ready ${pr.number})`);
  }
  if (problems.length) {
    console.log(`\nNOT READY to merge:\n${problems.map((m) => `  - ${m}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`\nREADY. Once every check on PR #${pr.number} has passed (gh pr checks ${pr.number}), merge it yourself:\n  gh pr merge ${pr.number} --rebase`);
}

// ---------- sql: loading paths into the library ----------

const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sqlNumber = (n) => (n === undefined || n === null ? "null" : String(n));
const sqlNeeds = (needs) => (needs.length ? `array[${needs.map(sqlText).join(", ")}]::text[]` : "'{}'::text[]");

function sql(args) {
  const entries = readPaths();
  const bad = entries.filter((e) => e.error);
  if (bad.length) die(`Fix these first: ${bad.map((e) => path.basename(e.file)).join(", ")} (run check)`);
  const wanted = args.filter((a) => !a.startsWith("--"));
  const unknown = wanted.filter((id) => !entries.some((e) => e.path.id === id));
  if (unknown.length) die(`No such path: ${unknown.join(", ")}`);
  const paths = entries
    .map((e) => e.path)
    .filter((p) => !wanted.length || wanted.includes(p.id))
    .sort((a, b) => (a.sort ?? DEFAULT_SORT) - (b.sort ?? DEFAULT_SORT) || a.id.localeCompare(b.id));
  const pathRows = paths.map(
    (p) =>
      `  (${sqlText(p.id)}, ${sqlText(p.kind)}, ${sqlText(p.name)}, ${sqlText(p.italic)},\n   ${sqlText(p.promise)},\n   ${sqlText(p.why)},\n` +
      `   ${sqlNeeds(p.needs)}, ${p.minutes_per_day}, 'draft', ${p.sort ?? DEFAULT_SORT})`,
  );
  const dayRows = paths.flatMap((p) =>
    p.days.map(
      (d, i) =>
        `  (${sqlText(p.id)}, ${i + 1}, ${sqlText(d.youtube_id)}, ${d.focus_start}, ${d.focus_end}, ${sqlText(d.theme)}, ${d.key_at}, ${sqlText(d.key_title)},\n` +
        `   ${sqlText(d.key_quote)}, ${sqlNumber(d.teaching_start)})`,
    ),
  );
  const lastDays = paths.map((p) => `  (${sqlText(p.id)}, ${p.days.length})`);
  console.log(`-- ${paths.length} of the paths and series in content/paths, from \`node scripts/paths.mjs sql\`.
-- Idempotent: re-running updates the text and days in place and removes days beyond
-- each path's last day. It never changes status, so a new path arrives as a draft and a
-- published one stays published, and it never deletes a path.
-- Requires the paths, teaching series and teaching start migrations and the sermon
-- catalogue (every youtube_id must exist in public.sermons). Guide: docs/development/paths.md.

begin;

insert into public.paths (id, kind, name, italic, promise, why, needs, minutes_per_day, status, sort) values
${pathRows.join(",\n")}
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  italic = excluded.italic,
  promise = excluded.promise,
  why = excluded.why,
  needs = excluded.needs,
  minutes_per_day = excluded.minutes_per_day,
  sort = excluded.sort;

insert into public.path_days (path_id, day, youtube_id, focus_start, focus_end, theme, key_at, key_title, key_quote, teaching_start) values
${dayRows.join(",\n")}
on conflict (path_id, day) do update set
  youtube_id = excluded.youtube_id,
  focus_start = excluded.focus_start,
  focus_end = excluded.focus_end,
  theme = excluded.theme,
  key_at = excluded.key_at,
  key_title = excluded.key_title,
  key_quote = excluded.key_quote,
  teaching_start = excluded.teaching_start;

delete from public.path_days pd using (values
${lastDays.join(",\n")}
) as last_day (path_id, days)
where pd.path_id = last_day.path_id and pd.day > last_day.days;

commit;`);
}

// ---------- library browsing ----------

async function find(args) {
  const all = args.includes("--all");
  const limitAt = args.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) || 25 : 25;
  const terms = args.filter((a, i) => !a.startsWith("--") && i !== limitAt + 1);
  if (!terms.length) die("Give words to look for, for example: find forgive offence");
  const client = await library();
  const where = terms.map(
    (_, i) => `(s.title || ' ' || coalesce(c.summary, '') || ' ' || coalesce(array_to_string(c.main_points, ' '), '') || ' ' || coalesce(c.topic, '')) ilike $${i + 1}`,
  );
  if (!all) {
    where.push(`s.duration_seconds <= ${MAX_SECONDS}`, "s.video_ready_at is not null", "c.kind not in ('prayer_meeting', 'worship')");
    where.push(`c.preacher in (${APOSTLE.map((name) => `'${name}'`).join(", ")})`);
  }
  const rows = await query(
    client,
    `select s.youtube_id, s.published_at::date as published, s.duration_seconds, s.title, c.preaching_start, c.topic, c.topic_fit, c.kind, c.summary
       from public.sermons s join public.sermon_cards c using (youtube_id)
      where ${where.join(" and ")}
      order by c.topic_fit desc nulls last, s.published_at desc limit ${Math.min(limit, 200)}`,
    terms.map((t) => `%${t}%`),
  );
  await client.end();
  for (const r of rows) {
    const start = r.preaching_start === null ? "-" : clock(r.preaching_start);
    console.log(`${r.youtube_id}  ${r.published.toISOString().slice(0, 10)}  ${clock(r.duration_seconds)}  preaching ${start}  ${r.kind}  ${r.topic ?? "-"} ${r.topic_fit ?? ""}`);
    console.log(`    ${r.title}`);
    console.log(`    ${(r.summary ?? "").slice(0, 300)}`);
  }
  console.log(`\n${rows.length} sermons${all ? "" : " (by the Apostle, 3 hours or less, video ready, no prayer meetings or worship; --all for every sermon)"}.`);
}

async function sermon([id]) {
  if (!id) die("Give a youtube_id.");
  const client = await library();
  const [s] = await query(
    client,
    `select s.youtube_id, s.title, s.event, s.published_at::date as published, s.duration_seconds, s.video_ready_at is not null as video_ready, c.*
       from public.sermons s left join public.sermon_cards c using (youtube_id) where s.youtube_id = $1`,
    [id],
  );
  await client.end();
  if (!s) die(`${id} is not in the library.`);
  const used = readPaths().filter((e) => e.path?.days?.some((d) => d.youtube_id === id)).map((e) => e.path.id);
  console.log(`${s.title}\n${s.youtube_id}  ${s.published.toISOString().slice(0, 10)}  length ${clock(s.duration_seconds)}  video ${s.video_ready ? "ready" : "not on R2 yet"}`);
  if (s.event) console.log(`Event: ${s.event}`);
  console.log(`Preacher: ${s.preacher ?? "-"}  kind: ${s.kind ?? "-"}  topic: ${s.topic ?? "-"} (fit ${s.topic_fit ?? "-"})`);
  console.log(`Preaching: ${s.preaching_start === null ? "-" : `${clock(s.preaching_start)} (${Math.round(s.preaching_start)} s)`} to ${s.preaching_end === null ? "the end" : clock(s.preaching_end)}`);
  console.log(`\n${s.summary ?? "(no card)"}`);
  for (const point of s.main_points ?? []) console.log(`  - ${point}`);
  if (s.scriptures?.length) console.log(`Scriptures: ${s.scriptures.join("; ")}`);
  console.log(`\nUsed by: ${used.join(", ") || "no path yet"}`);
  if (Number(s.duration_seconds) > MAX_SECONDS) console.log("Over 3 hours: it can't go in a path or series.");
}

async function transcript([id, from, to]) {
  if (!id) die("Give a youtube_id, and optionally from and to (seconds or h:mm:ss).");
  const client = await library();
  const [card] = await query(client, "select preaching_start from public.sermon_cards where youtube_id = $1", [id]);
  const start = seconds(from) ?? Number(card?.preaching_start ?? 0);
  const end = seconds(to) ?? start + 20 * 60;
  const rows = await query(
    client,
    "select start_s, end_s, text from public.passages where youtube_id = $1 and end_s >= $2 and start_s <= $3 order by start_s",
    [id, start, end],
  );
  await client.end();
  if (!rows.length) die(`No transcript for ${id} between ${clock(start)} and ${clock(end)}.`);
  for (const r of rows) console.log(`[${clock(r.start_s)}  ${Math.round(r.start_s)}s-${Math.round(r.end_s)}s] ${r.text.replace(/\s+/g, " ")}\n`);
  console.log(`Passages overlap by about 15%. Shown ${clock(start)} to ${clock(end)}; give from and to for more.`);
}

function needsCovered() {
  const text = fs.readFileSync(NEEDS_SEED, "utf8");
  const needs = [...text.matchAll(/^\s*\('([a-z0-9-]+)', '((?:[^']|'')*)'/gm)].map((m) => [m[1], m[2].replace(/''/g, "'")]);
  const by = new Map();
  for (const { path: p } of readPaths()) for (const n of p?.needs ?? []) by.set(n, [...(by.get(n) ?? []), p.id]);
  for (const [id, label] of needs) console.log(`${by.has(id) ? "  " : "* "}${id.padEnd(17)} ${label}${by.has(id) ? `  (${by.get(id).join(", ")})` : ""}`);
  console.log(`\n* ${needs.filter(([id]) => !by.has(id)).length} of ${needs.length} needs have no path yet.`);
}

function used() {
  const by = new Map();
  for (const { path: p } of readPaths()) for (const [i, d] of (p?.days ?? []).entries()) by.set(d.youtube_id, [...(by.get(d.youtube_id) ?? []), `${p.id} day ${i + 1}`]);
  for (const [id, where] of [...by].sort()) console.log(`${id}  ${where.join(", ")}`);
  console.log(`\n${by.size} sermons in ${readPaths().length} paths and series.`);
}

// ---------- main ----------

const [command, ...rest] = process.argv.slice(2);
const commands = { needs: needsCovered, find, sermon, transcript, used, check, ready, sql };
if (!commands[command]) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
  process.exit(command ? 1 : 0);
}
await commands[command](rest);
