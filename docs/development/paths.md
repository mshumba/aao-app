# Building guided paths and teaching series

This is the whole job, start to finish, for any agent (Claude, ChatGPT, Gemini in Antigravity, Muse or anyone else). Follow it as written and you merge your own PR: the checks replace a reviewer re-reading the transcripts.

## What a path is
- **A guided path** walks a viewer through one need ("I can't forgive", "I feel spiritually dry") in about 5 to 7 days.
- **A teaching series** follows one subject through several teachings, with no need attached.
- **One day is one whole sermon by Apostle Arome Osayi.** The app plays it from where his preaching starts, which it takes from the sermon card, and runs it to the end. Pick sermons for the quality and fit of the teaching. **No sermon over 3 hours.**
- **Each day also has:**
  - a theme;
  - a rough focus window, meaning where in the sermon that day's point is taught (rough is fine);
  - one key moment: a short quote that sums up the day, word for word from the transcript.
- **Every path arrives as a draft.** The app labels drafts until the ministry publishes them, and nobody but the owner changes that.

## The files
Each path or series is one file: `content/paths/<id>.json`. That folder is the only place paths are written. There is no seed file to edit. When the owner says so, Claude loads paths into the library with `node scripts/paths.mjs sql <id>`. A path PR is that one file, so agents working in parallel never conflict.

```json
{
  "id": "learning-to-forgive",
  "kind": "path",
  "name": "Learning to forgive",
  "italic": "forgive",
  "promise": "Six days from holding on to letting go.",
  "why": "For believers carrying a hurt they cannot release. The path ...",
  "needs": ["forgive"],
  "minutes_per_day": 15,
  "days": [
    {
      "youtube_id": "AbCdEfGhIjK",
      "theme": "Why forgiveness frees you first",
      "focus_start": 1210,
      "focus_end": 2140,
      "key_at": 1533,
      "key_title": "Release to be released",
      "key_quote": "The words exactly as the transcript has them, with capitals and punctuation added."
    }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | Lower-case words joined by hyphens; the file is named `<id>.json`. |
| `kind` | `"path"` or `"series"`. |
| `name` | Up to 120 characters. |
| `italic` | The words of `name` shown in italics (up to 60); they must appear in `name`. |
| `promise` | One sentence, up to 200 characters: what the viewer gets. |
| `why` | Up to 1,000 characters: who it's for and how the days build. |
| `needs` | Need ids from `node scripts/paths.mjs needs`. A path has one or two; a series has `[]`. |
| `minutes_per_day` | 1 to 60: roughly how long the focus windows run. Existing paths say 14 to 16. |
| `days` | 1 to 30 days, in order. No sermon twice in one path. |
| `youtube_id` | The sermon. |
| `theme` | Up to 80 characters. |
| `focus_start`, `focus_end` | Seconds into the video. Rough is fine. |
| `key_at` | Seconds, about 3 s before the quote's first word. |
| `key_title` | Up to 60 characters. |
| `key_quote` | Up to 400 characters, word for word from the transcript. You may add capitals and punctuation, and drop "uh", "um" or an immediate repeat of a word or two. Nothing else. |
| `teaching_start` | Leave it out. The app starts at the card's preaching start. Set it only when that start is wrong, and say why in the PR. |
| `sort` | Leave it out; the owner orders the paths. |

**Writing style:** warm and hope-first, in British spelling, with no serial comma. Never claim the ministry endorses the app. Describe the teaching, never the transcript ("the Apostle teaches...", not "the captions say...").

## The steps

**1. Set up your own copy.** Never work in the owner's folder, and never in another agent's.
```bash
cd "/Users/mufaroshumba/Documents/ChatGPT/AAO App"
git fetch origin
git worktree add -b <you>/path-<id> ../aao-<you>-<id> origin/claude/frontend-ux-pass
cd ../aao-<you>-<id>
cp -cR "/Users/mufaroshumba/Documents/ChatGPT/AAO App/node_modules" .   # a clone, never a symlink
```
The library commands find the read-only login in the main folder's `.env.helpers` by themselves. Never copy, print or commit that file.

**2. Claim your path before you build it.**
- **Check it isn't taken:** `ls content/paths` and `gh pr list --search "Path:"` show what exists or is in progress.
- **Claim it:** commit your file with just its `id`, `kind`, `name` and `needs` filled in, then open a draft PR titled `Path: <name>` into `claude/frontend-ux-pass`.

**3. Find the sermons.**
```bash
node scripts/paths.mjs needs                       # which needs have no path yet
node scripts/paths.mjs find forgive bitterness     # sermons by the Apostle, 3 hours or less, whose card matches every word
node scripts/paths.mjs sermon <youtube_id>         # length, where the preaching starts, summary, points, scriptures, paths using it
node scripts/paths.mjs transcript <youtube_id> 0:25:00 0:40:00   # the words with their times
```
`find` searches the sermon cards (AI summaries), so read the transcript before you choose a sermon. Avoid sermons another path already uses unless nothing else fits.

**4. Write the days.** Copy each `key_quote` from the `transcript` output, not from memory or YouTube.

**5. Check until there are no errors.**
```bash
node scripts/paths.mjs check content/paths/<id>.json
```
- **It checks against the live library:** the sermon exists, is under 3 hours and is preached by the Apostle; the times fit inside the video; the quote is word for word near `key_at`; the needs are real.
- **Errors block the merge.**
- **Warnings are judgement calls:** fix them, or explain each one in the PR.

**6. Commit your one file.**
```bash
git add content/paths/<id>.json
git commit -m "Path: <name>"
```

**7. Sync, then open the PR.**
- **Sync first:** run `git fetch origin && git rebase origin/claude/frontend-ux-pass`, then `check` again.
- **The PR:** push, and mark the PR ready. Give it one path, titled `Path: <name>`.
- **The PR body:**
  - the `check` output, pasted in full;
  - one line per day on why that sermon;
  - any warnings you kept, with the reason.

**8. Merge it yourself.**
```bash
node scripts/paths.mjs ready
```
- **What `ready` checks:** it says READY only when all of these hold:
  - your branch is up to date with `origin/claude/frontend-ux-pass`;
  - it adds exactly one new file in `content/paths/` and changes nothing else;
  - that file passes `check` against the library;
  - its PR is open, pushed and not a draft.
- **Then wait for CI:** `gh pr checks <number>` must show every check passed.
- **Then merge:** `gh pr merge <number> --rebase`.
- **If another agent merged first,** rebase, push with `git push --force-with-lease` and run `ready` again.

## Never in a path PR
- Any file other than your own `content/paths/<id>.json`.
- Changes to another path's file, unless the owner asked for them.
- A `status` field, or any write to the database.
- Merging any PR but your own path PR, or merging without READY from `ready`.
- App code, migrations or other content. Those go in their own PRs, following `AGENTS.md`.

## What happens next
A merged path is in the repo, not yet in the app. The owner says when to load paths into the live library, and they appear as drafts.
