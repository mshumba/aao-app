"""
Reads every sermon's whole transcript with Claude Sonnet 5.5 and writes one
"sermon card" per sermon: a short summary, the main points, the scriptures,
its main topic (of the 8 in public.topics), who it's for, what kind of
service it is, and where the preaching starts and ends.

    set -a; . ./.env; set +a
    python3 -I scripts/read-sermons.py sample 10      # reads 10 now, at full price
    python3 -I scripts/read-sermons.py submit         # the rest, through the Batch API (half price)
    python3 -I scripts/read-sermons.py collect        # waits for the batches, then saves their cards
    python3 -I scripts/read-sermons.py save           # writes the cards to the database and re-tags topics
    python3 -I scripts/read-sermons.py sample --ids-file ids.txt   # reads exactly these again, at full price

Cards go to --out (default docs/sermon-cards, which git ignores) as
cards.jsonl, one JSON object per line keyed by youtube_id. A sermon that
already has a card is read again only when named with --ids or --ids-file:
`sample N`, `submit`, `collect` and `save` can be re-run without paying to
read a sermon twice, but each run of `sample --ids` or `--ids-file` reads
every sermon named and is charged again.

`save` upserts every card into public.sermon_cards, then rebuilds
public.sermon_topics from them: a sermon gets its card's topic when the fit
is 4 or 5, scored by the fit plus a tenth of the embedding match. For new
sermons: `sample N` reads the N newest without a card, then `save`. To read
some again (after the instructions below change), put their ids in a file,
one per line, and run `sample --ids-file FILE` (or `sample --ids=ID1,ID2`).
It reads exactly those, says which it skipped because they aren't sermons
with a transcript, and puts each new card in place of its sermon's line in
cards.jsonl; an empty --ids or file stops it before it reads anything.
Review the new cards, and only then `save`: until then the database keeps
the old ones. `sample` is charged at full price, twice what the Batch API
charges (`submit` can't do this: it reads only sermons without a card, and
only once).

`submit` estimates the cost from the sample's real token counts and stops
before sending anything if the whole run would pass --cap dollars (default
85). Needs SUPABASE_ACCESS_TOKEN (to read transcripts through the Management
API) and ANTHROPIC_API_KEY: the coordinator's .env, never a helper's.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

PROJECT = "tkyzinjphxjwhfagoypm"
MODEL = "claude-sonnet-5-5"
# Dollars per million tokens (platform.claude.com pricing, October 2026).
PRICE = {"in": 2.0, "out": 10.0, "cache_read": 0.10, "cache_write_1h": 4.0}
BATCH_DISCOUNT = 0.5
MAX_OUTPUT = 4000
BATCH_SIZE = 900

TOPICS = ["hearing-god", "prayer", "purpose-calling", "faith-hope", "grace-holiness", "holy-spirit", "everyday-life", "comfort-healing"]
KINDS = ["sermon", "teaching", "prayer_meeting", "worship", "conference_session", "ministration", "testimonies", "other"]
FLAGS = ["garbled_captions", "mostly_prayer", "mostly_worship", "not_english", "partial_transcript", "several_speakers"]

SYSTEM = """You read whole sermon transcripts from Apostle Arome Osayi's YouTube channel (Remnant Christian Network) for a sermon app, and write one card per sermon as JSON in the given format.

The transcript is YouTube's automatic captions, split into passages, each starting with its time as [h:mm:ss]. Captions mishear names and scripture references; correct obvious mishearings only when you are sure (for example "Hebrews 11" for "he brews eleven"), otherwise leave them out.

What to record:
- summary: 2-3 plain sentences on what the sermon teaches, in the present tense ("The Apostle teaches that..."). Describe; never invent quotes or claims he didn't make.
- main_points: 3-6 short points in the order he makes them, each under 20 words.
- scriptures: the passages he actually reads or builds on, as "Book chapter:verse" (or "Book chapter"), most central first, at most 8.
- topic: the ONE topic the sermon is mainly about, from the 8 below, or null if none fits.
- topic_fit: 1-5, how squarely it serves someone who picked that topic (5 = exactly what they want, 3 = a fair fit, 1 = a stretch).
- also_topic: a second topic only if it is a major theme in its own right (roughly a third of the sermon or more); otherwise null.
- for_whom: one line on who would be helped most ("believers who keep falling into the same sin").
- kind: sermon, teaching (a session in a teaching series or school), prayer_meeting (mostly praying), worship (mostly singing), conference_session, ministration (healing, deliverance or prophetic ministry), testimonies, or other.
- preacher: who preaches, as named in the transcript or title ("Apostle Arome Osayi" unless clearly someone else).
- preaching_start: seconds where the preaching or teaching itself begins, after worship, announcements, introductions and opening prayer, taken from the passage times; null if there is no preaching.
- preaching_end: seconds where the preaching ends, before closing prayer, ministration or announcements; null if it runs to the end.
- language: the main language spoken, as an ISO code ("en", "fr", "pcm").
- flags: any that apply: garbled_captions (the captions are mostly nonsense or machine-translated), mostly_prayer, mostly_worship, not_english, partial_transcript (the transcript clearly covers only part of the service), several_speakers.

How to write it: describe the sermon itself, never the transcript or captions. Don't say what they cover, where they end, what they leave out or how a name is spelt in them; the flags record that. If too little can be made out to describe any teaching, leave main_points empty. Write in British English (favour, honour, centre, labour, saviour, fulfil, recognise), with no comma before the "and" or "or" that ends a list ("prayer, worship and testimonies") and with curly quotation marks and apostrophes (“ ”, ‘ ’ and ’).

The 8 topics:
- hearing-god (Hearing God): recognising God's voice and receiving direction: Scripture, inner witness, dreams, visions, prophetic perception, discerning God's leading. Gifts of prophecy and revelation belong here.
- prayer (Prayer): teaching on prayer, fasting, intercession, ministering to the Lord, the secret place, spiritual warfare in prayer. Prayer meetings, vigils and fasting days that are mostly praying belong here too.
- purpose-calling (Purpose & Calling): discovering and fulfilling your assignment, ministry and calling, destiny, preparation and waiting seasons, raising and sending labourers.
- faith-hope (Faith & Hope): faith, trusting God, believing His promises, perseverance through delay, fear, anxiety and pressure.
- grace-holiness (Grace & Holiness): grace, holiness, consecration, sanctification, purity, repentance, overcoming sin and temptation, the cross, salvation and the foundations of the new life.
- holy-spirit (The Holy Spirit): the person and work of the Holy Spirit, His presence, baptism and fullness, walking in the Spirit, the human spirit, spiritual gifts and power.
- everyday-life (Everyday Life): ONLY when the sermon actually teaches on marriage, courtship, singleness, family, children, work, career, school, money, business, or relationships, offence and forgiveness between people. A doctrinal sermon with an everyday illustration is NOT this.
- comfort-healing (Comfort & Healing): ONLY when the sermon ministers to people in grief, heartbreak, rejection, discouragement, depression, sickness or pain: God's comfort, divine healing, restoration of the broken. Passing words like "peace" or "rest" do NOT count; deliverance warfare belongs to prayer.

Use topic = null for worship sets, child dedications, interviews, announcements, birthday tributes, testimonies only, or a transcript too garbled or short to judge."""

nullable = lambda schema: {"anyOf": [schema, {"type": "null"}]}
# Structured output: Sonnet 5.5 returns exactly this JSON. Limits and counts
# (at most 8 scriptures, a fit of 1-5) are in the instructions, since the
# schema can't carry them.
CARD = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "main_points": {"type": "array", "items": {"type": "string"}},
        "scriptures": {"type": "array", "items": {"type": "string"}},
        "topic": nullable({"type": "string", "enum": TOPICS}),
        "topic_fit": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
        "also_topic": nullable({"type": "string", "enum": TOPICS}),
        "for_whom": {"type": "string"},
        "kind": {"type": "string", "enum": KINDS},
        "preacher": {"type": "string"},
        "preaching_start": nullable({"type": "number"}),
        "preaching_end": nullable({"type": "number"}),
        "language": {"type": "string"},
        "flags": {"type": "array", "items": {"type": "string", "enum": FLAGS}},
    },
    "required": ["summary", "main_points", "scriptures", "topic", "topic_fit", "also_topic", "for_whom", "kind",
                 "preacher", "preaching_start", "preaching_end", "language", "flags"],
    "additionalProperties": False,
}


def post(url, body, headers, method="POST", tries=4):
    for attempt in range(tries):
        try:
            data = json.dumps(body).encode() if body is not None else None
            request = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(request, timeout=600) as response:
                raw = response.read()
            return raw
        except urllib.error.HTTPError as error:
            # Client errors won't change on a retry; rate limits and 5xx might.
            if error.code < 500 and error.code != 429 or attempt == tries - 1:
                raise SystemExit(f"{method} {url.split('?')[0]}: HTTP {error.code} {error.read().decode()[:300]}")
        except Exception:
            if attempt == tries - 1:
                raise
        time.sleep(3 + 5 * attempt)


def sql(query):
    raw = post(
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        {"query": query},
        {"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json",
         "User-Agent": "aao-read-sermons"},
    )
    return json.loads(raw)


def anthropic(path, body=None, method="POST"):
    raw = post(
        "https://api.anthropic.com/v1/" + path,
        body,
        {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
         "content-type": "application/json"},
        method=method,
    )
    return raw


def clock(seconds):
    s = int(seconds or 0)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


HAS_TRANSCRIPT = "exists (select 1 from public.passages p where p.youtube_id = s.youtube_id and p.dup_of is null)"
YOUTUBE_ID = re.compile(r"[A-Za-z0-9_-]{11}")


def quoted(ids):
    return ",".join("'" + i + "'" for i in ids)


def sermons_to_read(done):
    rows = sql(f"select s.youtube_id from public.sermons s where {HAS_TRANSCRIPT} order by s.published_at desc")
    return [r["youtube_id"] for r in rows if r["youtube_id"] not in done]


def listed_ids(text):
    """The ids given to --ids or in an --ids-file, in order and once each."""
    return list(dict.fromkeys(y for y in re.split(r"[\s,]+", text) if y))


def readable(ids):
    """Which of these sermons have a transcript. Only well-formed ids reach the query."""
    ids = [y for y in ids if YOUTUBE_ID.fullmatch(y)]
    if not ids:
        return set()
    rows = sql(f"select s.youtube_id from public.sermons s where s.youtube_id in ({quoted(ids)}) and {HAS_TRANSCRIPT}")
    return {r["youtube_id"] for r in rows}


def picked(wanted, can_read):
    """The wanted ids that can be read, in the order given, and the ones skipped."""
    return [y for y in wanted if y in can_read], [y for y in wanted if y not in can_read]


def transcripts(ids):
    """{youtube_id: user message text}, fetched 40 sermons at a time."""
    out = {}
    for k in range(0, len(ids), 40):
        rows = sql(f"""select s.youtube_id, s.title, s.event, s.speaker, s.published_at::date as published,
            s.duration_seconds,
            (select string_agg('[' || p.start_s::int || '] ' || replace(p.text, E'\\n', ' '), E'\\n' order by p.start_s)
               from public.passages p where p.youtube_id = s.youtube_id and p.dup_of is null) as body
          from public.sermons s where s.youtube_id in ({quoted(ids[k:k + 40])})""")
        for r in rows:
            lines = []
            for line in (r["body"] or "").split("\n"):
                if line.startswith("["):
                    secs, _, text = line[1:].partition("] ")
                    lines.append(f"[{clock(float(secs))}] {text}")
            out[r["youtube_id"]] = (
                f"Title: {r['title']}\nEvent: {r['event'] or '-'}\nSpeaker in title: {r['speaker'] or '-'}\n"
                f"Published: {r['published']}\nLength: {clock(r['duration_seconds'])}\n\nTranscript:\n" + "\n".join(lines)
            )
        print(f"  fetched {min(k + 40, len(ids))}/{len(ids)} transcripts", flush=True)
    return out


def params(text):
    return {
        "model": MODEL,
        "max_tokens": MAX_OUTPUT,
        "system": [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral", "ttl": "1h"}}],
        "output_config": {"format": {"type": "json_schema", "schema": CARD}},
        "messages": [{"role": "user", "content": text}],
    }


def card_from(message):
    if message.get("stop_reason") not in ("end_turn", "stop_sequence"):
        return None
    for block in message.get("content", []):
        if block.get("type") == "text":
            try:
                return json.loads(block["text"])
            except ValueError:
                return None
    return None


def cost(usage, discount=1.0):
    return discount * (
        usage.get("input_tokens", 0) * PRICE["in"]
        + usage.get("output_tokens", 0) * PRICE["out"]
        + usage.get("cache_read_input_tokens", 0) * PRICE["cache_read"]
        + usage.get("cache_creation_input_tokens", 0) * PRICE["cache_write_1h"]
    ) / 1e6


def load(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def append(path, rows):
    with open(path, "a") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def keep(path, card):
    """Adds a card to cards.jsonl, in place of its sermon's old card if it has one."""
    cards = load(path)
    if all(c["youtube_id"] != card["youtube_id"] for c in cards):
        append(path, [card])
        return
    with open(path + ".tmp", "w") as f:
        for c in cards:
            f.write(json.dumps(card if c["youtube_id"] == card["youtube_id"] else c, ensure_ascii=False) + "\n")
    os.replace(path + ".tmp", path)


# The card's topic counts when the card rates the fit this high or higher.
TAG_FIT = 4
CARD_COLUMNS = ("youtube_id text, summary text, main_points jsonb, scriptures jsonb, topic text, topic_fit int, "
                "also_topic text, for_whom text, kind text, preacher text, preaching_start real, preaching_end real, "
                "language text, flags jsonb")


def save(cards):
    """Upserts the cards into public.sermon_cards, then rebuilds sermon_topics."""
    for k in range(0, len(cards), 150):
        rows = json.dumps(cards[k:k + 150], ensure_ascii=False)
        tag = "card" + str(abs(hash(rows)) % 10**8)
        assert f"${tag}$" not in rows
        sql(f"""insert into public.sermon_cards (youtube_id, summary, main_points, scriptures, topic, topic_fit,
              also_topic, for_whom, kind, preacher, preaching_start, preaching_end, language, flags, model, read_at)
            select x.youtube_id, x.summary,
              array(select jsonb_array_elements_text(x.main_points)), array(select jsonb_array_elements_text(x.scriptures)),
              x.topic, x.topic_fit, x.also_topic, x.for_whom, x.kind, x.preacher, x.preaching_start, x.preaching_end,
              x.language, array(select jsonb_array_elements_text(x.flags)), '{MODEL}', now()
            from jsonb_to_recordset(${tag}${rows}${tag}$::jsonb) as x({CARD_COLUMNS})
            where exists (select 1 from public.sermons s where s.youtube_id = x.youtube_id)
            on conflict (youtube_id) do update set
              summary = excluded.summary, main_points = excluded.main_points, scriptures = excluded.scriptures,
              topic = excluded.topic, topic_fit = excluded.topic_fit, also_topic = excluded.also_topic,
              for_whom = excluded.for_whom, kind = excluded.kind, preacher = excluded.preacher,
              preaching_start = excluded.preaching_start, preaching_end = excluded.preaching_end,
              language = excluded.language, flags = excluded.flags, model = excluded.model, read_at = excluded.read_at""")
        print(f"  saved {min(k + 150, len(cards))}/{len(cards)} cards", flush=True)
    sql(f"""begin;
      delete from public.sermon_topics;
      with tagged as (
        select youtube_id, topic, topic_fit from public.sermon_cards where topic is not null and topic_fit >= {TAG_FIT}
      ),
      c as (
        select p.youtube_id, avg(p.embedding::extensions.vector(768)) as v
        from public.passages p join tagged t using (youtube_id)
        where p.dup_of is null and not coalesce(p.hidden_from_search, false)
        group by p.youtube_id
      )
      insert into public.sermon_topics (youtube_id, topic_id, rank, score)
      select t.youtube_id, t.topic, 1,
        t.topic_fit + 0.1 * greatest(-5, least(5, coalesce(
          ((1 - (c.v operator(extensions.<=>) tv.embedding::extensions.vector(768))) - tv.mean) / tv.sd, 0)))
      from tagged t
      join public.topic_vectors tv on tv.topic_id = t.topic
      left join c using (youtube_id);
      commit;""")
    counts = sql("select t.label, count(st.*) n from public.topics t left join public.sermon_topics st on st.topic_id = t.id group by t.label, t.sort order by t.sort")
    print("tags:", ", ".join(f"{r['label']} {r['n']}" for r in counts))


def ids_joined(argv, options):
    """The arguments with `--ids X` written `--ids=X`, so X is taken as the
    ids: argparse takes a value that starts with '-' for an option, and some
    ids do (-MNPWdJ28wE). X is left as it is when it's one of `options`, the
    script's own (`--ids -h`, `--ids --ids-file=F`), so argparse still says
    --ids was given no ids rather than reading none."""

    def own(word):
        name = word.split("=", 1)[0]
        # argparse also takes the start of a long option for it (--ids-f);
        # no id can be one, as every id is longer than every option.
        return name in options or name.startswith("--") and any(o.startswith(name) for o in options)

    out, k = [], 0
    while k < len(argv):
        if argv[k] == "--ids" and k + 1 < len(argv) and not own(argv[k + 1]):
            out.append("--ids=" + argv[k + 1])
            k += 2
        else:
            out.append(argv[k])
            k += 1
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("step", choices=["sample", "submit", "collect", "save"])
    parser.add_argument("count", nargs="?", type=int, help="how many new sermons `sample` reads (default 10)")
    parser.add_argument("--ids", help="`sample` reads exactly these, by youtube_id, separated by commas")
    parser.add_argument("--ids-file", help="`sample` reads exactly the ids in this file, one per line")
    parser.add_argument("--out", default="docs/sermon-cards")
    parser.add_argument("--cap", type=float, default=85.0, help="dollars the whole run may cost")
    # argparse's own table of the option strings it knows, -h and --help among them.
    args = parser.parse_args(ids_joined(sys.argv[1:], parser._option_string_actions))
    os.makedirs(args.out, exist_ok=True)
    cards_path = os.path.join(args.out, "cards.jsonl")
    spend_path = os.path.join(args.out, "spend.jsonl")
    batches_path = os.path.join(args.out, "batches.jsonl")
    done = {c["youtube_id"] for c in load(cards_path)}

    if args.step == "sample":
        if args.ids is not None or args.ids_file is not None:
            if args.count is not None:
                sys.exit("Give `sample` a count or ids, not both.")
            text = args.ids or ""
            if args.ids_file is not None:
                with open(args.ids_file) as f:
                    text += "\n" + f.read()
            wanted = listed_ids(text)
            if not wanted:
                sys.exit("No ids were given, so nothing was read.")
            ids, skipped = picked(wanted, readable(wanted))
            if skipped:
                print(f"Skipped {len(skipped)} that aren't sermons with a transcript: {', '.join(skipped)}")
        else:
            ids = sermons_to_read(done)[: 10 if args.count is None else args.count]
        texts = transcripts(ids)
        for y in ids:
            message = json.loads(anthropic("messages", params(texts[y])))
            card = card_from(message)
            usage = message.get("usage", {})
            append(spend_path, [{"youtube_id": y, "mode": "sample", "chars": len(texts[y]), "usage": usage,
                                 "dollars": round(cost(usage), 5)}])
            if card:
                keep(cards_path, {"youtube_id": y, **card})
            print(f"{y}  {card and card.get('topic')}  fit {card and card.get('topic_fit')}  "
                  f"in {usage.get('input_tokens')} out {usage.get('output_tokens')}  ${cost(usage):.3f}", flush=True)
        return

    if args.step == "submit":
        spent = load(spend_path)
        sampled = [s for s in spent if s["mode"] == "sample" and s["usage"].get("input_tokens")]
        if not sampled:
            sys.exit("Run `sample` first, so the estimate uses real token counts.")
        if load(batches_path):
            sys.exit("Batches were already sent; run `collect`.")
        tokens_per_char = sum(s["usage"]["input_tokens"] + s["usage"].get("cache_read_input_tokens", 0)
                              + s["usage"].get("cache_creation_input_tokens", 0) for s in sampled) / sum(s["chars"] for s in sampled)
        out_tokens = sum(s["usage"]["output_tokens"] for s in sampled) / len(sampled)
        ids = sermons_to_read(done)
        texts = transcripts(ids)
        system_tokens = len(SYSTEM) * tokens_per_char
        estimate = BATCH_DISCOUNT * sum(
            (len(texts[y]) * tokens_per_char * PRICE["in"] + system_tokens * PRICE["cache_read"] + out_tokens * PRICE["out"]) / 1e6
            for y in ids)
        already = sum(s["dollars"] for s in spent)
        print(f"{len(ids)} sermons to read; estimated ${estimate:.2f} through the Batch API, plus ${already:.2f} already spent")
        if estimate + already > args.cap:
            sys.exit(f"Stopped: that would pass the ${args.cap:.0f} cap. Nothing was sent.")
        for k in range(0, len(ids), BATCH_SIZE):
            chunk = ids[k:k + BATCH_SIZE]
            batch = json.loads(anthropic("messages/batches", {"requests": [{"custom_id": y, "params": params(texts[y])} for y in chunk]}))
            append(batches_path, [{"id": batch["id"], "count": len(chunk)}])
            print(f"  sent batch {batch['id']} with {len(chunk)} sermons", flush=True)
        return

    if args.step == "save":
        save(load(cards_path))
        return

    if args.step == "collect":
        batches = load(batches_path)
        if not batches:
            sys.exit("No batches sent yet.")
        while True:
            states = [json.loads(anthropic(f"messages/batches/{b['id']}", None, method="GET")) for b in batches]
            counts = [s["request_counts"] for s in states]
            print(time.strftime("%H:%M"), " | ".join(f"{s['processing_status']} {c['succeeded']}ok {c['processing']}left {c['errored']}err"
                                                     for s, c in zip(states, counts)), flush=True)
            if all(s["processing_status"] == "ended" for s in states):
                break
            time.sleep(120)
        total, bad = 0.0, []
        for s in states:
            raw = anthropic(f"messages/batches/{s['id']}/results", None, method="GET").decode()
            for line in raw.splitlines():
                row = json.loads(line)
                y = row["custom_id"]
                if y in done:
                    continue
                if row["result"]["type"] != "succeeded":
                    bad.append((y, row["result"]["type"]))
                    continue
                message = row["result"]["message"]
                usage = message.get("usage", {})
                dollars = cost(usage, BATCH_DISCOUNT)
                total += dollars
                append(spend_path, [{"youtube_id": y, "mode": "batch", "usage": usage, "dollars": round(dollars, 5)}])
                card = card_from(message)
                if card:
                    append(cards_path, [{"youtube_id": y, **card}])
                    done.add(y)
                else:
                    bad.append((y, "no card"))
        print(f"saved {len(done)} cards in all; this collect cost ${total:.2f}; {len(bad)} not read: {bad[:10]}")


if __name__ == "__main__":
    main()
