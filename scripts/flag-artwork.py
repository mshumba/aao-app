"""
Finds sermons whose YouTube artwork has black bars down both sides (a 4:3,
square or portrait poster centred in a 16:9 frame), and writes their ids,
with the share of the frame's width the poster fills, into
src/data/artworkFixes.ts, where kit/Artwork.tsx shows only the poster.

    python3 -I scripts/flag-artwork.py --cache <folder outside the repo>

For every sermon in the catalogue it fetches YouTube's mqdefault copy
(320x180), politely: two at a time with a pause between requests, and once
only (copies already in the cache folder are reused). A copy is flagged when
the pixel columns at 3% and 97% of its width are near-black (luma under 20)
for at least 90% of its height, and the dark runs at the two sides are about
as wide as each other (YouTube centres the poster; a dark photo isn't). The
poster's share is what's left between the narrower run and its mirror,
rounded up to a usual poster shape when it's close to one (a dark edge in
the poster itself reads as bar).

The catalogue is the public one the app reads (Supabase REST with the
publishable key, read only), given by EXPO_PUBLIC_SUPABASE_URL and
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the environment; neither is
printed. Without them, or with --bundled, it checks the sample bundled with
the app (src/data/sermons.ts). Only the generated block of artworkFixes.ts
changes; the hand-checked artOverride list is kept as it is.

Needs Pillow. Under -I the user's own site-packages aren't on the path, so
it is added explicitly (after everything else) when Pillow isn't found.
"""

import argparse
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    import site

    sys.path.append(site.getusersitepackages())
    from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "artworkFixes.ts"
BUNDLED = ROOT / "src" / "data" / "sermons.ts"
START = "// <flag-artwork>"
END = "// </flag-artwork>"
YOUTUBE_ART = re.compile(r"^https://i\.ytimg\.com/vi(?:_webp)?/[^/]+/[a-z0-9]+\.(?:jpg|webp)$")

# Near-black, the share of a column that must be it, and where to look.
DARK = 20
SHARE = 0.9
EDGES = (0.03, 0.97)
# How far apart the two dark runs may be, as shares of the width.
LOPSIDED = 0.035
# Poster shapes in a 16:9 frame (width over the frame's): 16:10, 3:2, A4
# landscape, 4:3, 1:1, 4:5, 3:4 and 9:16; a measured share this close below
# one snaps to it.
SHAPES = (0.9, 0.844, 0.795, 0.75, 0.5625, 0.45, 0.422, 0.316)
SNAP = 0.04
# Politeness: workers, and the pause each takes between requests.
WORKERS = 2
PAUSE = 0.15


def catalogue(bundled_only):
    """[(youtube_id, thumbnail_url)] for every sermon."""
    url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    if bundled_only or not url or not key:
        text = BUNDLED.read_text()
        ids = re.findall(r'youtube_id: "([^"]+)"', text)
        thumbs = re.findall(r'thumbnail_url: "([^"]+)"', text)
        print(f"Bundled sample: {len(ids)} sermons")
        return list(zip(ids, thumbs))
    rows, offset = [], 0
    while True:
        request = urllib.request.Request(
            f"{url}/rest/v1/sermons?select=youtube_id,thumbnail_url&order=youtube_id"
            f"&limit=1000&offset={offset}",
            headers={"apikey": key, "Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            page = json.load(response)
        rows += page
        if len(page) < 1000:
            break
        offset += 1000
    print(f"Catalogue: {len(rows)} sermons")
    return [(r["youtube_id"], r.get("thumbnail_url")) for r in rows]


_last = threading.local()


def fetch(youtube_id, cache):
    """The mqdefault copy in the cache folder, fetched if it isn't there yet."""
    path = cache / f"{youtube_id}.jpg"
    if path.exists() and path.stat().st_size > 0:
        return path
    wait = PAUSE - (time.monotonic() - getattr(_last, "at", 0))
    if wait > 0:
        time.sleep(wait)
    request = urllib.request.Request(
        f"https://i.ytimg.com/vi/{youtube_id}/mqdefault.jpg",
        headers={"User-Agent": "aao-app flag-artwork (one-off check)"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = response.read()
            break
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            time.sleep(2 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 * (attempt + 1))
    else:
        return None
    _last.at = time.monotonic()
    path.write_bytes(data)
    return path


def dark_share(image, x):
    """The share of column x that is near-black."""
    height = image.height
    return sum(1 for y in range(height) if image.getpixel((x, y)) < DARK) / height


def bars(path):
    """
    (flagged, left, right): whether both edge columns are near-black, and
    how wide the dark run at each side is, as a share of the width.
    """
    with Image.open(path) as source:
        image = source.convert("L")
    width = image.width
    flagged = all(dark_share(image, round(edge * (width - 1))) >= SHARE for edge in EDGES)
    if not flagged:
        return False, 0.0, 0.0
    left = next((x for x in range(width) if dark_share(image, x) < SHARE), width)
    right = next((x for x in range(width) if dark_share(image, width - 1 - x) < SHARE), width)
    return True, left / width, right / width


def poster_share(left, right):
    """The poster's share of the frame's width, or None for a dark photo."""
    if abs(left - right) > LOPSIDED:
        return None
    share = 1 - 2 * min(left, right)
    for shape in SHAPES:
        if shape - SNAP <= share <= shape:
            return shape
    return round(share, 2)


def write(shares):
    """Replaces the generated block in artworkFixes.ts, keeping the rest."""
    lines = "\n".join(
        f'  {json.dumps(i)}: {shares[i]:g},' for i in sorted(shares)
    )
    block = (
        f"{START}\n"
        "// Generated by scripts/flag-artwork.py: don't edit by hand.\n"
        "export const pillarboxed: Readonly<Record<string, number>> = {\n"
        f"{lines}\n"
        "};\n"
        f"{END}"
    )
    text = OUT.read_text()
    if START not in text or END not in text:
        sys.exit(f"{OUT} has no {START} block to replace")
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    OUT.write_text(head + block + tail)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--cache", required=True, help="folder for the downloads, outside the repo")
    parser.add_argument("--bundled", action="store_true", help="check the bundled sample only")
    parser.add_argument("--report", help="also write each flagged id's bar widths here (JSON)")
    args = parser.parse_args()
    cache = Path(args.cache).resolve()
    if cache == ROOT or ROOT in cache.parents:
        sys.exit("Keep the downloads outside the repo: pass a --cache folder elsewhere.")
    cache.mkdir(parents=True, exist_ok=True)

    sermons = catalogue(args.bundled)
    # Art the app takes from somewhere else isn't YouTube's frame.
    checked = [i for i, thumb in sermons if not thumb or YOUTUBE_ART.match(thumb)]
    with ThreadPoolExecutor(WORKERS) as pool:
        paths = list(pool.map(lambda i: (i, fetch(i, cache)), checked))
    missing = [i for i, path in paths if path is None]
    shares, report = {}, {}
    for youtube_id, path in paths:
        if path is None:
            continue
        hit, left, right = bars(path)
        if not hit:
            continue
        share = poster_share(left, right)
        report[youtube_id] = {"left": round(left, 3), "right": round(right, 3), "share": share}
        if share is not None:
            shares[youtube_id] = share
    write(shares)
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=1))
    print(
        f"Checked {len(paths) - len(missing)}, flagged {len(shares)}, "
        f"dark photos left alone {len(report) - len(shares)}, unavailable {len(missing)}"
    )


if __name__ == "__main__":
    main()
