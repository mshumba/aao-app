# Next UI pass (after the design-review fixer and final check finish)

Owner approvals (15 Oct 2026, verbatim):
- Loading animation: "yes shuffling is fine check ui-skills too for help" (concept: aao_search_loading_animation_concept widget).
- Blessing idea: "maybe we can tell the user a blessing each time they open the app and it can be a new one" (needs the owner's review of the blessings list before shipping; build the UI against fixtures + the table once approved).
- Teaching series: 2×12, 2×6, 1×1, proposal first, then live (session local_54e598e9-509c-437c-aed3-c057ebc93d22 owns content; kind='series' on public.paths).
- Clean-verbatim quotes (backend; nothing to do in the app except trusting the quote text).

## 1. Search loading: "shuffling artwork"
- Fan of 3–5 REAL sermon thumbnails from the catalogue (prefer the newest or sermons matching the query's topic if known; cached images only, so no network wait), front card straight, two behind at -8° / +6°; every ~700 ms the front card moves to the back (translate + rotate + scale, Reanimated, ease-out `cubicBezier(0.23,1,0.32,1)`, ~550 ms). UI thread only (shared values), no JS-driven intervals that re-render the list.
- Status line, honest and in order: "Understanding what you're going through…" → "Searching 2,812 sermons for <b>{theme}</b>…" (only once the theme is known; otherwise "Searching 2,812 sermons…") → "Choosing the clearest moments…". Crossfade 240 ms. The sermon count comes from the catalogue, not hard-coded.
- Below: the existing static sand placeholders breathe (opacity 1 ↔ 0.55, 1.6 s) — no shimmer.
- Results: show as soon as moments arrive (never wait for an animation cycle); animate the results container in once (FadeInDown 250 ms) and stagger the first 3–4 cards 30–80 ms via a memoized per-index `entering` only if the list is NOT virtualized; if it is (FlatList/FlashList), animate the container only (animate-expo RECIPES: never `entering` on recycled rows).
- Haptic: `Haptics.selectionAsync()` when results land (event-driven, not animation-end).
- Fast paths: if the response is cached/chip (< ~400 ms), skip the fan entirely (no flash of loading).
- Reduced motion (`useReducedMotion()` / ReduceMotion.System): fan static, no translation/scale; keep the text crossfade and opacity changes.
- Interaction contract: each search gets a request id; an older response arriving after a newer query must be ignored; clearing the field cancels (AbortController) and returns to the default state; errors replace the loader with the calm states already built.
- Accessibility: the loader is one live region announcing the status line changes politely; the fan is decorative (hidden from screen readers).
- Skills to follow: ~/.claude/skills/animate-expo (SKILL.md, RECIPES.md), interaction-contracts, better-accessibility (motion-and-zoom.md), react-native-best-practices.

## 2. Care card (distress searches)
- The search response now has `care: true` for distress (search-polish workflow adds it). Show, above results, a calm card: "You don't have to carry this alone." + "If you might act on these thoughts, call your local emergency number now." + "Find a helpline" (https://findahelpline.com, opens externally) + optional "Talk to someone at a church near you" later. No alarm colours; navy/sand; not dismissible on first render; screen-reader first.

## 3. Path status in search
- `path.status` is in the response; the compact "A path for this" card shows "Draft" subtly when status is draft.

## 4. Blessing on Home (APPROVED and LIVE: 108 rows in public.blessings)
Owner: "i dont want the app to play the adudio" / "just show it". So: text only, NO play button, no link to the sermon.
- Under the greeting: the blessing in Newsreader italic (max ~4 lines, never truncated mid-sentence; it may wrap), and the Bible reference below it in small gold caps when `scripture_ref` is set (owner: "show Bible references"). Optionally a quiet muted "Apostle Arome Osayi" attribution line if it fits the hero; no link.
- New one on every app open (each time the app comes to the foreground), no repeats until all 108 have been seen (per device, AsyncStorage, wrapped in try/catch). Keep a cached copy of all rows so it shows instantly and offline; refresh quietly in the background.
- Data: `select id, text, scripture_ref from blessings order by sort` with the publishable key (RLS allows published rows only). In local test mode use 5 fixture blessings.
- Accessibility: read as one sentence: "Blessing: <text>. <reference>". Respect Dynamic Type caps (quoteLarge cap 1.5).

## 5. Teaching series section
- Paths tab: separate "Teaching series" section for kind='series' (12/6/1 teachings), using the same cards/detail; detail kicker "TEACHING SERIES · 12 TEACHINGS"; a 1-teaching series opens straight to its single teaching.

## 6. Paths/series play the FULL sermon (owner decision, 15 Oct)
Owner: "when someone is in a path they should get the sermon in full and maybe when we grow and can host videos we can have overlays for 'focus Segments' for now dont do too much shaboingery with them".
- Path/series day opens /sermon/<id> with ?path=&day= but NO ?t=focus_start: resume the saved position if any, else start at 0.
- Remove focus UI: the gold focus bracket and "Day 3 focus · 49:10–1:06:50" on the scrubber band, "16-min focus from …" captions, "Play Day 3 · 18-min focus" pill, the end-of-focus "That's today's teaching" prompt. Times shown are the full sermon's ("2 hr 37 min", "48 min left").
- Keep "Key moment 53:44 · <title>" (a single timestamp jump is fine) and moment ticks.
- Day completion: when the viewer finishes the sermon (>= 95% watched, same rule as continue-watching) OR taps "Mark Day 3 done" (new quiet text button under the day / on the sermon page's PartOfPathRow). Day-complete sheet stays.
- Sticky CTA: "▶ Continue Day 3 · 48 min left" (full-sermon time left) / "▶ Start Day 1 · 2 hr 16 min".
- Paths tab card kicker: "7 MESSAGES" (drop "ABOUT 15 MIN A DAY"); path detail line "Day 3 of 7" plus optional total hours.
- Keep focus_start/focus_end in the data model untouched.
- Teaching series are LIVE (15 Oct): paths.kind='series', sort 101-105: building-on-the-right-foundation (12), knowing-the-holy-spirit (12), the-way-of-the-cross (6), living-by-faith (6), seeking-the-face-of-god (1). Do not show paths.minutes_per_day as watch time (it's the focus-segment average); use the full sermons' durations (sum or "12 teachings"). Kicker for series: "TEACHING SERIES · 12 TEACHINGS".

## 7. Final-check leftovers (15 Oct; grades: Search 9.5, Path 9, Sermon 8.5, Paths tab 8.5, Home 8) — owner of each fix in brackets
1. [pages] Home hero: newest-sermon flyers collide with the title and avatar. Keep the dark scrim to ~51% of the width and fade to ~80% like the concept (`src/home/Hero.tsx`), not just past the measured title; check with text-heavy flyer thumbnails.
2. [pages] `src/kit/moments.tsx` (~270–278): the playing moment row uses a cool grey `#f3f4f6` and a 3pt navy left border on a rounded card — the "AI card" pattern. Use `c.featureOnSurface` (#f3eee5) and no one-sided border (state via the navy timestamp chip and "PLAYING" kicker).
3. [paths] Scrubber: remove the gold focus brackets and the "Day 3 focus · …" label (also required by §6); white moment ticks only.
4. [coordinator, data] Path italic phrases come from `paths.italic`; the concept italicises only "habitual" in "Breaking free from habitual sin". Data fix, done on the Mac.
5. [pages] Continue watching: add "See all", and art-only tiles with "1 hr 12 min left" on the art (no title under it) like the concept; the full list lives behind See all.
6. [pages] Tab icons: the concept's Home and Paths glyphs need `react-native-svg` — you may add it with `npx expo install react-native-svg` (a native rebuild is happening anyway for expo-image).
7. [paths] Path page: Day 5 shows faintly under the sticky CTA; end the list cleanly (bottom padding / fade) like the concept.
8. [pages] Home scrolled: the 94% cream status-bar strip over the dark path card leaves a pale band with a hard edge; fade it or switch the status-bar treatment over dark content.
9. [search] "Moments that speak to this" is ~5% larger than the concept; and draft paths need the "Draft" marker in Search's guided-paths list too (consistent with the Paths tab).
10. [search] The backend is live (search v14): responses now include `care` (boolean) and `path.status`. In `src/learning/client.ts`, send the header `x-region: us-east-1` on calls to the search and quotes functions (the database is in us-east-1; a forced far region made cached answers 3–4× slower for Nigeria-based users). Keep the client-side distress fallback anyway.

## 8. Owner: no draft labels (15 Oct)
"remove this \"Draft · awaiting ministry review\"" — remove all user-facing draft markers (TrustLine for drafts renders nothing; no "Draft" in Search's path card or guided list, the Paths tab or the join sheet). Never show "Order set by the ministry" unless status = 'published'.
