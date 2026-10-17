"""
Tags new sermons with their main topic, the same way the catalogue was tagged
on 16 Oct 2026 (supabase/seed/topics.sql, migration 20261016000500):

1. Embedding match: the sermon's transcript passages are averaged and compared
   with each topic's vector in public.topic_vectors, standardised (z) with the
   catalogue's mean and spread stored there.
2. AI reader: gpt-5.4-mini reads the title and seven transcript excerpts spread
   through the sermon against the rules below and names the main topic, or none.
3. The sermon is tagged (rank 1, score = z) only when the reader's topic is one
   of its two best matches with z >= 0. Otherwise it stays untagged: still in
   the library and search, just not under a topic.

    set -a; . ./.env; set +a
    python3 -I scripts/tag-topics.py --since 2026-10-01           # shows what it would tag
    python3 -I scripts/tag-topics.py --since 2026-10-01 --apply   # writes the tags

It looks at sermons published since --since (default: 45 days ago) that have
transcript passages and no topic yet, so run it after new transcripts land.
Sermons the reader and the match disagree on are read again on the next run,
which costs a fraction of a cent each. Needs SUPABASE_ACCESS_TOKEN (Management
API, writes as the database owner) and OPENAI_API_KEY: the coordinator's .env,
never a helper's.
"""

import argparse
import datetime
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

PROJECT = "tkyzinjphxjwhfagoypm"
MODEL = "gpt-5.4-mini"

RULES = """You tag sermons by Apostle Arome Osayi (Remnant Christian Network) for a sermon app. People pick topics when they join; their Home shows sermons from those topics. A wrong tag puts the wrong sermon in front of someone, so tag only what the sermon is actually ABOUT, not passing mentions or illustrations.

The 8 topics:
- hearing-god (Hearing God): recognising God's voice and receiving direction: Scripture, inner witness, dreams, visions, prophetic perception, discerning God's leading from your own thoughts. Gifts of prophecy and revelation belong here.
- prayer (Prayer): teaching on prayer, fasting, intercession, ministering to the Lord, the secret place, spiritual warfare in prayer. Prayer meetings, vigils and fasting days that are mostly praying belong here too.
- purpose-calling (Purpose & Calling): discovering and fulfilling your assignment, ministry and calling, destiny, preparation and waiting seasons, raising and sending labourers.
- faith-hope (Faith & Hope): faith, trusting God, believing His promises, perseverance through delay, fear, anxiety and pressure.
- grace-holiness (Grace & Holiness): grace, holiness, consecration, sanctification, purity, repentance, overcoming sin and temptation, the cross, salvation and the foundations of the new life.
- holy-spirit (The Holy Spirit): the person and work of the Holy Spirit, His presence, baptism and fullness, walking in the Spirit, the human spirit, spiritual gifts and power.
- everyday-life (Everyday Life): ONLY when the sermon actually teaches on marriage, courtship, singleness, family, children, work, career, school, money, business, or relationships, offence and forgiveness between people. A doctrinal sermon with an everyday illustration is NOT this.
- comfort-healing (Comfort & Healing): ONLY when the sermon ministers to people in grief, heartbreak, rejection, discouragement, depression, sickness or pain: God's comfort, divine healing, restoration of the broken. Passing words like "peace" or "rest" do NOT count; deliverance warfare belongs to prayer.

Rules: give the main topic, and add another topic in "also" only when it is a major theme in its own right (roughly a third of the sermon or more). Most sermons have no "also" topic; never more than 2. Use main = null when no topic fits: worship or music sets, child dedications, interviews, announcements, MC welcomes, birthday tributes, testimonies only, or a transcript that is garbled, machine-translated nonsense or too short to judge. Judge from the transcript excerpts first; the title helps but can be generic ("Weekly Bible Study").
"fit" says how squarely the sermon serves someone who picked the main topic: 5 = it is exactly what they want, 3 = a fair fit, 1 = a stretch.
Reply as JSON: {"main": "<id or null>", "fit": <1-5>, "also": ["<id>", ...], "reason": "<under 15 words>"}"""

# Passages that count, as in the seed: not duplicates, not hidden from search.
PASSAGES = "dup_of is null and not coalesce(hidden_from_search, false)"


def post(url, body, headers, tries=4):
    for attempt in range(tries):
        try:
            request = urllib.request.Request(
                url, data=json.dumps(body).encode(), headers=headers, method="POST"
            )
            return json.load(urllib.request.urlopen(request, timeout=600))
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 + 3 * attempt)


def sql(query):
    return post(
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        {"query": query},
        {
            "Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"],
            "Content-Type": "application/json",
            "User-Agent": "aao-tag-topics",
        },
    )


def quoted(ids):
    return ",".join("'" + i.replace("'", "") + "'" for i in ids)


def candidates(since):
    return [
        r["youtube_id"]
        for r in sql(
            f"""select s.youtube_id from public.sermons s
            where s.published_at >= '{since}'
              and exists (select 1 from public.passages p where p.youtube_id = s.youtube_id and p.{PASSAGES})
              and not exists (select 1 from public.sermon_topics st where st.youtube_id = s.youtube_id)
            order by s.published_at"""
        )
    ]


def best_matches(ids):
    """{youtube_id: [(z, topic_id), ...] best first}"""
    rows = sql(
        f"""with c as (
          select youtube_id, avg(embedding::extensions.vector(768)) as v
          from public.passages where youtube_id in ({quoted(ids)}) and {PASSAGES}
          group by youtube_id
        )
        select c.youtube_id, tv.topic_id,
          ((1 - (c.v operator(extensions.<=>) tv.embedding::extensions.vector(768))) - tv.mean) / tv.sd as z
        from c cross join public.topic_vectors tv"""
    )
    out = {}
    for r in rows:
        out.setdefault(r["youtube_id"], []).append((float(r["z"]), r["topic_id"]))
    return {y: sorted(v, reverse=True) for y, v in out.items()}


def excerpts(ids):
    return sql(
        f"""with p as (
          select youtube_id, start_s, left(text, 420) t,
            row_number() over (partition by youtube_id order by start_s) i,
            count(*) over (partition by youtube_id) n
          from public.passages where youtube_id in ({quoted(ids)}) and {PASSAGES} and words >= 60
        ),
        pick as (
          select youtube_id, start_s, t from p
          where n <= 7 or i in (1, greatest(1, n * 2 / 10), n * 3 / 10, n * 5 / 10, n * 6 / 10, n * 8 / 10, n * 9 / 10)
        ),
        ex as (select youtube_id, json_agg(t order by start_s) ex from pick group by youtube_id)
        select s.youtube_id, s.title, s.event, round(s.duration_seconds / 60.0) minutes,
          left(s.description, 300) description, ex.ex
        from public.sermons s left join ex using (youtube_id)
        where s.youtube_id in ({quoted(ids)})"""
    )


def read(sermon):
    body = {
        "title": sermon["title"],
        "event": sermon["event"],
        "minutes": sermon["minutes"],
        "description": sermon["description"],
        "transcript_excerpts_in_order": sermon["ex"] or [],
    }
    res = post(
        "https://api.openai.com/v1/chat/completions",
        {
            "model": MODEL,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": RULES},
                {"role": "user", "content": json.dumps(body, ensure_ascii=False)},
            ],
        },
        {"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"], "Content-Type": "application/json"},
    )
    return sermon["youtube_id"], json.loads(res["choices"][0]["message"]["content"])


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    default_since = (datetime.date.today() - datetime.timedelta(days=45)).isoformat()
    parser.add_argument("--since", default=default_since, help="published on or after (YYYY-MM-DD)")
    parser.add_argument("--apply", action="store_true", help="write the tags (default: only show them)")
    args = parser.parse_args()
    datetime.date.fromisoformat(args.since)

    ids = candidates(args.since)
    print(f"{len(ids)} sermons since {args.since} with transcripts and no topic")
    if not ids:
        return
    matches = best_matches(ids)
    with ThreadPoolExecutor(8) as pool:
        reads = dict(pool.map(read, excerpts(ids)))
    tags = []
    for y in ids:
        topic = (reads.get(y) or {}).get("main")
        two = [(z, t) for z, t in matches.get(y, [])[:2] if z >= 0]
        hit = next(((z, t) for z, t in two if t == topic), None)
        shown = ", ".join(f"{t} {z:.2f}" for z, t in matches.get(y, [])[:2])
        print(f"  {y}  reader: {topic or '-':16s} match: {shown:40s} -> {hit[1] if hit else 'untagged'}")
        if hit:
            tags.append((y, hit[1], round(hit[0], 3)))
    print(f"{len(tags)} to tag")
    if args.apply and tags:
        values = ",\n".join(f"('{y}', '{t}', 1, {z})" for y, t, z in tags)
        sql(
            "insert into public.sermon_topics (youtube_id, topic_id, rank, score) values\n"
            + values
            + "\non conflict (youtube_id, topic_id) do nothing"
        )
        print("written")


if __name__ == "__main__":
    main()
