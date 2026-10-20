"""
Reads every sermon's whole transcript with Claude Sonnet 5.5 and writes one
"sermon card" per sermon: a short summary, the main points, the scriptures,
its main topic (of the 9 in public.topics), who it's for, what kind of
service it is, and where the preaching starts and ends.

    set -a; . ./.env; set +a
    python3 -I scripts/read-sermons.py sample 10      # reads 10 now, at full price
    python3 -I scripts/read-sermons.py submit         # the rest, through the Batch API (half price)
    python3 -I scripts/read-sermons.py collect        # waits for the batches, then saves their cards
    python3 -I scripts/read-sermons.py reclassify     # re-picks every card's topic from the card alone
    python3 -I scripts/read-sermons.py save           # writes the cards to the database and re-tags topics

Cards go to --out (default docs/sermon-cards, which git ignores) as
cards.jsonl, one JSON object per line keyed by youtube_id. A sermon that
already has a card is never read again, so every step can be re-run.

`save` upserts every card into public.sermon_cards, then rebuilds
public.sermon_topics from them: a sermon gets its card's topic when the fit
is 4 or 5, scored by the fit plus a tenth of the embedding match. For new
sermons: `sample N` reads the N newest without a card, then `save`.

`submit` estimates the cost from the sample's real token counts and stops
before sending anything if the whole run would pass --cap dollars (default
85). Needs SUPABASE_ACCESS_TOKEN (to read transcripts through the Management
API) and ANTHROPIC_API_KEY: the coordinator's .env, never a helper's.

`reclassify` is for when the topics change: it sends every card's summary,
main points, scriptures, who it's for, kind and flags (never the transcript)
through the Batch API, waits, and rewrites each card's topic, topic_fit and
also_topic in cards.jsonl. It stops before sending if its estimate passes
--cap, and only needs ANTHROPIC_API_KEY. Run it again after an interruption
or a failed answer: it picks up the batches it already sent, then re-sends
only the cards not yet answered under the current topic rules.
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

PROJECT = "tkyzinjphxjwhfagoypm"
MODEL = "claude-sonnet-5-5"
# Dollars per million tokens (platform.claude.com pricing, October 2026).
PRICE = {"in": 2.0, "out": 10.0, "cache_read": 0.20, "cache_write_1h": 4.0}
BATCH_DISCOUNT = 0.5
MAX_OUTPUT = 4000
BATCH_SIZE = 900

TOPICS = ["hearing-god", "prayer", "purpose-calling", "faith-hope", "grace-holiness", "holy-spirit", "everyday-life", "healing",
          "deliverance"]
KINDS = ["sermon", "teaching", "prayer_meeting", "worship", "conference_session", "ministration", "testimonies", "other"]
FLAGS = ["garbled_captions", "mostly_prayer", "mostly_worship", "not_english", "partial_transcript", "several_speakers"]

# What a topic pick means; the full read and the re-classification share it.
TOPIC_FIELDS = """- topic: the ONE topic the sermon is mainly about, from the 9 below, or null if none fits.
- topic_fit: 1-5, how squarely it serves someone who picked that topic (5 = exactly what they want, 3 = a fair fit, 1 = a stretch).
- also_topic: a second topic only if it is a major theme in its own right (roughly a third of the sermon or more); otherwise null."""

TOPIC_RULES = """The 9 topics:
- hearing-god (Hearing God): recognising God's voice and receiving direction: Scripture, inner witness, dreams, visions, prophetic perception, discerning God's leading. Gifts of prophecy and revelation belong here.
- prayer (Prayer): teaching on prayer, fasting, intercession, ministering to the Lord, the secret place, watching and contending in prayer for people, churches, cities and nations. Prayer meetings, vigils and fasting days that are mostly praying belong here too, unless the praying is mainly for the sick (healing) or to break bondages and cast out (deliverance).
- purpose-calling (Purpose & Calling): discovering and fulfilling your assignment, ministry and calling, destiny, preparation and waiting seasons, raising and sending labourers.
- faith-hope (Faith & Hope): faith, trusting God, believing His promises, perseverance through delay, fear, anxiety and pressure.
- grace-holiness (Grace & Holiness): grace, holiness, consecration, sanctification, purity, repentance, overcoming sin, the flesh and temptation, the cross, salvation and the foundations of the new life.
- holy-spirit (The Holy Spirit): the person and work of the Holy Spirit, His presence, baptism and fullness, walking in the Spirit, the human spirit, spiritual gifts and power.
- everyday-life (Everyday Life): ONLY when the sermon actually teaches on marriage, courtship, singleness, family, children, work, career, school, money, business, or relationships, offence and forgiveness between people. A doctrinal sermon with an everyday illustration is NOT this.
- healing (Healing): God's healing for the body and the heart: divine healing of sickness, disease, infirmity and pain, Jesus the Healer, faith for healing, healing services; and God's comfort for people in grief, heartbreak, rejection, discouragement, depression or weariness. Passing words like "peace" or "rest" do NOT count.
- deliverance (Deliverance): freedom from the powers of darkness: curses, witchcraft, evil altars and covenants, ancestral and foundational bondage, demonic oppression and possession, spirit spouses, attacks in dreams, evil patterns, the believer's authority over demons, deliverance ministry and deliverance services.

Telling the close ones apart:
- Healing or Deliverance: sickness, pain, grief and a broken heart are healing; curses, spirits, altars, covenants and oppression are deliverance. When a service ministers both, pick the one it spends longest on.
- Deliverance or Prayer: teaching on how and why to pray, or praying mostly for revival, nations, churches, families or destiny, is prayer; teaching on or praying mostly to break curses, bondages and the works of darkness is deliverance. Contending, watching and intercession in general are prayer; warfare against a named bondage or oppression is deliverance.
- Deliverance or Grace & Holiness: sin, the flesh, habits and temptation are grace-holiness; bondage the sermon treats as demonic is deliverance.
- Deliverance or The Holy Spirit: the Spirit's person, presence and gifts are holy-spirit; using His power mainly to cast out devils and break oppression is deliverance.
- Healing or Faith & Hope: fear, anxiety, pressure and delay are faith-hope; sickness, grief and heartbreak are healing.
- A short healing, deliverance or prophetic ministration at the end of a sermon on something else doesn't change its topic; it is also_topic only if it fills roughly a third of the service or more.

Use topic = null for worship sets, child dedications, interviews, announcements, birthday tributes, testimonies only, or a transcript too garbled or short to judge."""

SYSTEM = """You read whole sermon transcripts from Apostle Arome Osayi's YouTube channel (Remnant Christian Network) for a sermon app, and write one card per sermon as JSON in the given format.

The transcript is YouTube's automatic captions, split into passages, each starting with its time as [h:mm:ss]. Captions mishear names and scripture references; correct obvious mishearings only when you are sure (for example "Hebrews 11" for "he brews eleven"), otherwise leave them out.

What to record:
- summary: 2-3 plain sentences on what the sermon teaches, in the present tense ("The Apostle teaches that..."). Describe; never invent quotes or claims he didn't make.
- main_points: 3-6 short points in the order he makes them, each under 20 words.
- scriptures: the passages he actually reads or builds on, as "Book chapter:verse" (or "Book chapter"), most central first, at most 8.
""" + TOPIC_FIELDS + """
- for_whom: one line on who would be helped most ("believers who keep falling into the same sin").
- kind: sermon, teaching (a session in a teaching series or school), prayer_meeting (mostly praying), worship (mostly singing), conference_session, ministration (healing, deliverance or prophetic ministry), testimonies, or other.
- preacher: who preaches, as named in the transcript or title ("Apostle Arome Osayi" unless clearly someone else).
- preaching_start: seconds where the preaching or teaching itself begins, after worship, announcements, introductions and opening prayer, taken from the passage times; null if there is no preaching.
- preaching_end: seconds where the preaching ends, before closing prayer, ministration or announcements; null if it runs to the end.
- language: the main language spoken, as an ISO code ("en", "fr", "pcm").
- flags: any that apply: garbled_captions (the captions are mostly nonsense or machine-translated), mostly_prayer, mostly_worship, not_english, partial_transcript (the transcript clearly covers only part of the service), several_speakers.

""" + TOPIC_RULES

# `reclassify` judges from the card alone, so it can follow a change of topics
# without reading 2,769 transcripts again.
RECLASSIFY = """You sort sermons from Apostle Arome Osayi's YouTube channel (Remnant Christian Network) into topics for a sermon app. Each message is one sermon's card, written by a reader who heard the whole sermon: its summary, main points, scriptures, who it helps most, the kind of service and any flags. Judge from the card alone and answer as JSON in the given format.

""" + TOPIC_FIELDS + "\n\n" + TOPIC_RULES

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
TOPIC_PICK = {
    "type": "object",
    "properties": {k: CARD["properties"][k] for k in ("topic", "topic_fit", "also_topic")},
    "required": ["topic", "topic_fit", "also_topic"],
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


def sermons_to_read(done):
    rows = sql("""select s.youtube_id from public.sermons s
      where exists (select 1 from public.passages p where p.youtube_id = s.youtube_id and p.dup_of is null)
      order by s.published_at desc""")
    return [r["youtube_id"] for r in rows if r["youtube_id"] not in done]


def transcripts(ids):
    """{youtube_id: user message text}, fetched 40 sermons at a time."""
    out = {}
    for k in range(0, len(ids), 40):
        chunk = ",".join("'" + i + "'" for i in ids[k:k + 40])
        rows = sql(f"""select s.youtube_id, s.title, s.event, s.speaker, s.published_at::date as published,
            s.duration_seconds,
            (select string_agg('[' || p.start_s::int || '] ' || replace(p.text, E'\\n', ' '), E'\\n' order by p.start_s)
               from public.passages p where p.youtube_id = s.youtube_id and p.dup_of is null) as body
          from public.sermons s where s.youtube_id in ({chunk})""")
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


def params(text, system=SYSTEM, schema=CARD, max_tokens=MAX_OUTPUT):
    return {
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral", "ttl": "1h"}}],
        "output_config": {"format": {"type": "json_schema", "schema": schema}},
        "messages": [{"role": "user", "content": text}],
    }


def card_text(card):
    """What `reclassify` sees of a card: never the transcript, the title or the old topic."""
    points = "\n".join("- " + p for p in card["main_points"])
    return (f"Kind: {card['kind']}\nFlags: {', '.join(card['flags']) or 'none'}\n\nSummary: {card['summary']}\n\n"
            f"Main points:\n{points}\n\nScriptures: {'; '.join(card['scriptures']) or 'none'}\n"
            f"For whom: {card['for_whom']}")


def wait_for(batches):
    """Polls until every batch has ended; returns their final states."""
    while True:
        states = [json.loads(anthropic(f"messages/batches/{b['id']}", None, method="GET")) for b in batches]
        counts = [s["request_counts"] for s in states]
        print(time.strftime("%H:%M"), " | ".join(f"{s['processing_status']} {c['succeeded']}ok {c['processing']}left {c['errored']}err"
                                                 for s, c in zip(states, counts)), flush=True)
        if all(s["processing_status"] == "ended" for s in states):
            return states
        time.sleep(120)


def results(state):
    raw = anthropic(f"messages/batches/{state['id']}/results", None, method="GET").decode()
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


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


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("step", choices=["sample", "submit", "collect", "reclassify", "save"])
    parser.add_argument("count", nargs="?", type=int, default=10)
    parser.add_argument("--out", default="docs/sermon-cards")
    parser.add_argument("--cap", type=float, default=85.0, help="dollars the whole run (or a reclassify) may cost")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    cards_path = os.path.join(args.out, "cards.jsonl")
    spend_path = os.path.join(args.out, "spend.jsonl")
    batches_path = os.path.join(args.out, "batches.jsonl")
    done = {c["youtube_id"] for c in load(cards_path)}

    if args.step == "sample":
        ids = sermons_to_read(done)[: args.count]
        texts = transcripts(ids)
        for y in ids:
            message = json.loads(anthropic("messages", params(texts[y])))
            card = card_from(message)
            usage = message.get("usage", {})
            append(spend_path, [{"youtube_id": y, "mode": "sample", "chars": len(texts[y]), "usage": usage,
                                 "dollars": round(cost(usage), 5)}])
            if card:
                append(cards_path, [{"youtube_id": y, **card}])
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

    if args.step == "reclassify":
        sent_path = os.path.join(args.out, "reclassify.jsonl")
        cards = load(cards_path)
        # A card is done once it has an answer under today's prompt; change the topics or rules
        # and every card is due again.
        prompt = hashlib.sha256(RECLASSIFY.encode()).hexdigest()[:12]
        spend = [s for s in load(spend_path) if s["mode"] == "reclassify" and s.get("prompt") == prompt]
        answered = {s["youtube_id"] for s in spend if s.get("ok")}
        applied = {s["batch"] for s in spend}
        sent = [b for b in load(sent_path) if b.get("prompt") == prompt and b["id"] not in applied]
        if not sent:
            todo = [c for c in cards if c["youtube_id"] not in answered]
            if not todo:
                sys.exit("Every card is re-classified under the current topics.")
            # About 3.5 characters a token, nothing cached, a short answer after brief thinking.
            estimate = BATCH_DISCOUNT * sum(
                ((len(RECLASSIFY) + len(card_text(c))) / 3.5 * PRICE["in"] + 150 * PRICE["out"]) / 1e6 for c in todo)
            print(f"{len(todo)} cards to re-classify; estimated ${estimate:.2f} through the Batch API")
            if estimate > args.cap:
                sys.exit(f"Stopped: that would pass the ${args.cap:.2f} cap. Nothing was sent.")
            for k in range(0, len(todo), BATCH_SIZE):
                chunk = todo[k:k + BATCH_SIZE]
                batch = json.loads(anthropic("messages/batches", {"requests": [
                    {"custom_id": c["youtube_id"], "params": params(card_text(c), RECLASSIFY, TOPIC_PICK, 1024)} for c in chunk]}))
                append(sent_path, [{"id": batch["id"], "count": len(chunk), "prompt": prompt}])
                print(f"  sent batch {batch['id']} with {len(chunk)} cards", flush=True)
                sent.append({"id": batch["id"]})
        picks, total, bad = {}, 0.0, []
        for s in wait_for(sent):
            rows = []
            for row in results(s):
                y = row["custom_id"]
                if row["result"]["type"] != "succeeded":
                    bad.append((y, row["result"]["type"]))
                    continue
                message = row["result"]["message"]
                usage = message.get("usage", {})
                dollars = cost(usage, BATCH_DISCOUNT)
                total += dollars
                pick = card_from(message)
                rows.append({"youtube_id": y, "mode": "reclassify", "batch": s["id"], "prompt": prompt, "ok": bool(pick),
                             "usage": usage, "dollars": round(dollars, 5)})
                if pick:
                    picks[y] = pick
                else:
                    bad.append((y, "no answer"))
            append(spend_path, rows)
        moved = sum(1 for c in cards if c["youtube_id"] in picks and picks[c["youtube_id"]]["topic"] != c["topic"])
        with open(cards_path + ".tmp", "w") as f:
            for c in cards:
                f.write(json.dumps({**c, **picks.get(c["youtube_id"], {})}, ensure_ascii=False) + "\n")
        os.replace(cards_path + ".tmp", cards_path)
        print(f"re-classified {len(picks)} cards ({moved} changed topic) for ${total:.2f}; "
              f"{len(bad)} still to do (run again): {bad[:10]}")
        return

    if args.step == "collect":
        batches = load(batches_path)
        if not batches:
            sys.exit("No batches sent yet.")
        total, bad = 0.0, []
        for s in wait_for(batches):
            for row in results(s):
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
