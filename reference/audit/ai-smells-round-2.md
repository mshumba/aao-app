# AAO: AI smells and what bites at scale, round 2

16 October 2026. A read-only audit of `claude/frontend-ux-pass` at 43d9e64, after the redesign (PRs #4 to #6), the polish round and TestFlight build 3. It follows the first audit of 15 and 16 October.

**How this was checked**

- I read the code for search and the care card, accounts, sync, the player, the catalogue and every user-facing string.
- I ran the web app in local mode at 390, 320 and 1440 wide, as a guest, a new user and a member, and took about 170 screenshots. The key ones are in [`round-2/`](round-2/).
- I read a few totals from the live database: counts and sizes only, nothing personal and no writes.

**Limits**

- This cloud environment blocks YouTube and its thumbnails. Every screenshot shows the app's fallback artwork, which is what a viewer sees when artwork fails or is still loading on a slow connection. Video is a stand-in player.
- I did not check the native iPhone behaviour: Google's sheet, haptics, VoiceOver and Dynamic Type.
- AGENTS.md, the project context and the decision log are gitignored, so they are not in this copy. I worked from the decisions in the brief and `reference/ui/next-ui-pass.md`.

---

## The short answer

1. **Does AAO still look AI-built?** Less than in October, and mostly on the surface.
   - The pages now have a voice: serif type with one italic phrase, ivory and navy, the artwork wall, quotes with play times, and the blessing.
   - What still gives it away: an onboarding built around topics that have no content, a "You're all set" tick, loader lines on a timer, an automatic italic on the last word of sermon titles, and settings rows with icons in circles.
   - Also: up to five different card styles for one sermon on Home, and 22 button components.
2. **Is search safe for someone in distress?** Not yet.
   - It only fails closed when a short keyword list matches.
   - Common wordings like "I'm tired of living", "I can't go on" and Pidgin "I wan die" still miss.
   - If the AI step then fails or times out, the person gets "Search isn't answering" and four topic chips, with no helpline.
   - Some prayers now get the crisis card, such as "I want to die to my flesh".
3. **Will it hold up when a church starts using it?** Not yet.
   - All guests on one church Wi-Fi share 20 new searches per 5 minutes, and the whole world shares 300 an hour.
   - Searches made of words nobody typed in the last 24 hours (and that day's first tap of each chip) all need OpenAI. Nobody is told when it fails.
   - An offline launch still holds the splash for about 25 seconds and then opens signed out.
4. **Is the code ready to grow?** Partly.
   - Fixed: the sermon page no longer redraws every second, and there is now one "next day" rule.
   - Worse: unused or duplicate UI code grew from about 780 to about 1,270 lines, and there are 22 button components.
   - Still there: two progress-saving systems and three ways of calling the server.
   - The database's migration history does not match the files in git.

---

## Top findings, ranked by impact

### 1. A distress search still fails open, and some prayers now get the crisis card

**Where**
- `supabase/functions/search/index.ts:461-530`, where `care = careAsTyped || understood?.care === true`
- `supabase/functions/_shared/prompts.ts:59-60` (the keyword list) and `:179` (the model's instruction)
- `src/search/care.ts:11-12` (the same list in the app)
- `src/search/SearchScreen.tsx:347-348`

**What users see**
- "I'm tired of living" while search is struggling: *Search isn't answering* with four chips, including "The same sin again". No helpline. (`round-2/01`)
- "I want to die to my flesh": the crisis card and comfort-only results. (`round-2/02`)
- When the list does match and search fails, the card stays. That works. But the line under it says "His teaching couldn't load just now", and "His" has nothing to refer to. (`round-2/03`)

**Why**
- The care card is guaranteed only when the keyword list matches. When it doesn't, the app relies on the AI step, which has 4.5 seconds.
- If that step times out or OpenAI is down or out of balance, the server sets care to false, searches the words as typed and returns ordinary results. The code's own comment says to avoid exactly that, because such passages "speak of it harshly".
- The list misses (tested against the real pattern):
  - English: "tired of living", "I can't go on", "I hate my life", "nobody would miss me"
  - Pidgin: "I wan die", "I don tire for this life", "wan comot for this world"
  - French: "je veux mourir"
  - Portuguese: "quero morrer", "vou me matar"
  - Swahili: "nataka kufa", "najiua"
- The model's instruction says "care: true **only when**…". It names no languages and says nothing about indirect wording.
- **False positives.** The list does skip "die to self" and "die to the flesh", but not these:
  - "I want to die to my flesh", "I want to die daily", "ready to die for Christ"
  - "suicide prevention sermon"
  - "killing myself slowly with sin"
- **Caching.** When the model misses a distress search, that answer is cached for 24 hours and served to anyone who types the same words. A cache hit doesn't re-check the list.
- **Rate limit.** It runs before any distress check, so a person in distress who hits the limit is told "Too many searches at once".

**Fix (about a day)**
1. Keep one shared list (server and app import the same file). Add the missed wordings and the three languages.
2. Add a broader "maybe" list. When it matches and the AI step failed, show the card. That is what failing closed really means.
3. Narrow the false positives: skip "die to my flesh / to the world / daily", "die for Christ / Jesus", and "ready to die for".
4. Rewrite the instruction: any language, including Nigerian Pidgin, French, Portuguese and Swahili; indirect statements count; when unsure, answer true.
5. Run the check before the rate limit. Re-check it on cache hits. Put a list version in the cache key.
6. Put the phrase table from the appendix into `tests/search-care.spec.ts`.

### 2. Search capacity is small, shared, and keyed to a header anyone can set

**Where**
- `supabase/functions/search/index.ts:50-51` (20 per 5 minutes per caller) and `:237` (`SEARCH_GLOBAL_PER_HOUR`, 300)
- `supabase/functions/quotes/index.ts:27-28` and `:109` (30 quotes an hour for everyone)
- `supabase/functions/_shared/auth.ts:42-45` (who a caller is)

**What users see**

*Too many searches at once — Try again in a minute.* This tells people they did something wrong.
- **One church on one Wi-Fi.** All guests on that connection share 20 new searches per 5 minutes. After that, the whole room gets this message.
- **Everyone together.** 300 new searches an hour is about 5 a minute, worldwide. Past that, every new search fails for up to an hour.
- **Quotes.** Only 30 quote look-ups an hour can be made for everyone. Past that, moments appear without the Apostle's words (`useSearch.ts:86-89`). That is the part of AAO that matters most.

**Why**
- **Guests are identified by IP.** A guest is counted by the left-most `x-forwarded-for` address, the one a client can write itself. I could not confirm whether Supabase's gateway replaces it. If it doesn't, one script can rotate it, use up the 300 an hour and block search for everyone.
- **Chips.** A chip tap skips the chat model but still makes one embedding call. It is cached only 24 hours, so the first tap of each of the 36 needs each day costs money and counts against the limit.
- **Live numbers today:** 72 distinct searches were cached in the last 24 hours, with one account on the project. A single Sunday service would pass 300 an hour.

**Fix**
- **Real limits.**
  - Set OpenAI's hard monthly spending limit as the real ceiling.
  - Raise the global count to what that budget allows.
  - Give signed-in people their own allowance, which they already have by user id.
- **Real client IP.** Identify guests by the address the platform adds, the right-most entry or the platform's own header, not the left-most.
- **Precompute the 36 chips.** Store their embeddings, or cache their answers until the needs or passages change, so a chip tap costs nothing.
- **Exempt distress searches** from all limits (see finding 1).

### 3. OpenAI is a single point of failure, and nobody is told

**Where**
- `supabase/functions/_shared/openai.ts:140-142`
- `src/lib/monitoring.ts`. There is no `captureException` anywhere in `src/`.

**What users see**

If the OpenAI balance runs out or OpenAI is down, any search that isn't already cached shows *Search isn't answering*. Chips fail too unless someone tapped them in the last day.

**Why**
- Every new search needs an embedding.
- There is no keyword fallback, even though 253 hand-picked moments sit in the `moments` table and the app never reads them.
- The server only writes logs. The app reports crashes to Sentry but not handled failures: search, sync, player and sign-in.
- So the first sign of an empty balance will be a message from a church member.

**Fix**
- Send handled failures to Sentry with a tag: search unavailable, quota, sync and player.
- Add a Sentry alert, or a daily email, on `insufficient_quota` or a burst of chat errors.
- Add a simple uptime check on the two functions.
- When OpenAI fails, fall back to the curated moments for chips, and to sermon-title matches for typed words.

### 4. Weak networks: the launch, the saves and the player

**Where**
- `src/app/_layout.tsx:80-87` and `src/auth/supabaseBackend.ts:124-142, 253-256`
- `src/auth/AccountProvider.tsx:396-420`
- `src/player/PlayerProvider.tsx:474-479`
- `src/catalogue/remote.ts:19, 49-61` and `src/catalogue/sync.ts:190-191`

**What users see**

**Launch.**
- Opened offline more than about an hour after the last use, the splash stays up for about 25 seconds while sign-in keeps retrying.
- The app then opens **signed out**: Saved and Continue watching are empty, Watch asks for an account, and path progress is the guest's.
- On a connection that hangs rather than fails, the wait has no limit on Android, because the Supabase client has no timeout.

**Watch position.**
- Positions save every 15 seconds and on pause, but a failed save is thrown away (`.catch(() => {})`).
- The queue lives only in memory, so closing the app loses it.
- After an offline launch, nothing is saved for the whole session.
- "Resuming at 1:10:00" looks right until the next launch, then goes back to an older place.

**Player.** After 15 seconds of loading it says "The player didn't load. Check your connection and try again." It doesn't retry by itself. A 2-hour sermon on a slow 3G link often needs longer than 15 seconds to start.

**First download.**
- The newest 200 sermons now arrive first, so Home shows sooner. That is fixed.
- The other 2,650 come as three parallel pages that must all finish within 20 seconds. That needs roughly 110 kbps sustained.
- If one page fails, they all fail. Nothing is kept, not even the 200, so the next try starts from zero.

**Fix**
- **Launch:** give `restore()` about 2 seconds, then open with the account stored on the device and correct it later.
- **Saves:** keep the save queue in device storage per user and send it when the app is active again.
- **Timeouts:** give the Supabase client the same 15-second `fetchWithTimeout` the rest of the app uses.
- **Player:** retry once automatically with a 30-second limit.
- **Catalogue:** save the first 200 and each page as it arrives, and fetch the rest one page at a time, resuming where it stopped.

### 5. Topics are still empty, and now they shape onboarding, Home and the first sermon

**Where**
- `src/data/edification.ts` (4 sermons tagged, `reviewStatus: "demo"`)
- `src/app/onboarding/topics.tsx`, `src/app/onboarding/done.tsx:40-69`, `src/home/TopicsRail.tsx`, `src/app/(tabs)/account.tsx`

**What users see**
- Step 1 of onboarding asks *What would you like to grow in?* and promises "We'll put them first". (`round-2/08` shows the result)
- The finish screen recommends a sermon from the 4 tagged ones, all from 22 to 27 September. Months from now it will still recommend one of those four.
- Home shows *From your topics* with the same 2 or 3 sermons and the note "Topics are sample labels, not yet checked against each sermon". (`round-2/07`)
- Account and sign-up promise "Keep your topics on any device".
- Search's *Browse by topic* hides itself in production, because no topic has 6 sermons.

**Why it matters**
- 4 of 2,850 sermons are tagged.
- Meanwhile the app has 36 real needs, with search, chips and paths behind them. Topics are a second, empty way of sorting the same thing.
- This is the "missing domain depth" smell: the machinery is there, but nothing is in it.

**Fix (pick one)**
- Remove the onboarding step, the Home rail and the Account row until sermons are really tagged.
- Or replace step 1 with the needs ("What are you going through?"), which already have content.

### 6. Trust copy still says things the code doesn't do

**Where and what it says**

| Screen | Copy | What the code does |
|---|---|---|
| Privacy (`privacy.tsx:118`, holding page too) | "No analytics." Crash reports "never include… searches". | Sentry sends performance traces from 10% of sessions (`monitoring.ts:17`), with session tracking on by default. On the web the typed question is in the page address (`?q=`), so it can reach Sentry with the URL. |
| Delete account (`account/delete.tsx:125`) | "Topics you chose on this device stay on it." | Deleting clears them (`AccountProvider.tsx:643`). Recent searches *do* stay on the device. |
| About (`about.tsx:45`) | "The words shown are the Apostle's own, from the sermon." | The same page says the channel includes other ministers. Results don't name the speaker. Quotes are cleaned-up YouTube captions. |
| Sign-up and Account | "Watch every sermon in full" | Guests can't watch at all (except shared links). "In full" suggests guests get part. |

**Fix**

Set `tracesSampleRate: 0` and turn off session tracking, or say plainly what is sent. Then rewrite three sentences:
- "Nothing of your account stays on this device."
- "Quotes are taken from the sermon's captions."
- "Watch any sermon"

Show the speaker on results when it isn't the Apostle.

### 7. Sermon titles get an automatic italic last word, numbers included

**Where:** `src/home/Hero.tsx:519` and `src/app/sermon/[id].tsx:493` (`italicLast`), using `src/kit/italic.ts:12-15`.

**What users see**
- "Pray Without *Ceasing*", "Apostolic Shift: Grand *Finale*", "Day Two *Morning*". (`round-2/04`, `round-2/14`)
- With live titles it gives "40 Days Fasting & Prayer: Day *22*" and "Gift of Prophecy *19*".
- Home shows two italics at once: the name in the greeting and the sermon title.

**Why it matters**
- The design direction says verified sermon titles are never given an italic word. It names this exact case as "out".
- An italic picked by position, not meaning, is a tell of generated design.

**Fix:** remove `italicLast` from the two sermon titles. Keep the data-driven italic on path names and the greeting's name.

### 8. Missing artwork breaks the layout: the weak-network look

**Where:** `src/sermon/Stage.tsx`, `src/kit/Artwork.tsx`, `src/blessing/Wall.tsx:20-22`, `src/onboarding/ArtworkCollage.tsx`.

**What users see while artwork hasn't arrived** (every screenshot here)
- **Sermon page:** the fallback title sits under the round play button. "Apostolic Shi▶Grand Finale" can't be read. (`round-2/04`, `round-2/05`)
- **Search results:** tiles are cut off mid-word, like "Apostolic Shift: Day ." and "Pray Without …". (`round-2/16`)
- **Welcome and blessing:** the walls become rows of blank pastel cards, which look like a page still loading. (`round-2/09`)
- **Blessing wall when artwork does load:**
  - Each poster is blurred (1/80 of its width) and set to 64% opacity.
  - Blurred thumbnails are the common "still loading" placeholder, so on a laptop the band is likely to read as images that never finished.
  - I could not see this with real artwork here; please check it on the Mac.

**Fix**
- Sermon page: when the play button shows, hide the fallback title or move it under the button.
- Small fallback tiles: show the series name on one line, or a quiet monogram, never a cut-off title.
- Blessing wall: drop the blur and keep the pale wash. Check it at 1440 wide with real artwork.

### 9. One idea, several names and several looks

**What users see**
- **"Series" means two things.** A conference ("Series · 3 messages", "Part of a series · Apostolic Shift 2026") and a teaching series ("Teaching series · 4 teachings").
  - A one-teaching series opens its sermon without saying so (`src/app/path/[id].tsx:102` drops the path).
  - If that sermon belongs to a conference, the page says "Part of a series" about the conference instead. (`round-2/05`)
- **One video, three nouns:** "messages" on paths, "teachings" in teaching series, "sermons" everywhere else.
- **The Paths tab heading** still reads *Guided journeys, one message a day* above the teaching series, which aren't daily. "Journeys" appears nowhere else. (`round-2/06`)
- **"See all" does four things on Home:**
  - expands the row in place
  - opens a topic page
  - opens All sermons
  - switches tab
- **Five sermon card styles on Home** (hero, art-only tile, rail card, row, series tile), and about 11 across the app.
- **Three path card styles:** Home's Start-here card, the Paths tab's big covers, and Search's compact dark cards.
- **Five ways to title a tab:** Home's greeting, Paths' overline and tagline, Search's kicker and question, Account's gold "ACCOUNT", Saved's large title.
- **The avatar is drawn two ways:** a 38pt navy initial on Home, and 64pt serif-italic initials in Account.
- **The blessing's Continue copies the welcome's rounded rectangle.** The owner approved that shape for the welcome only. Every other main button is a pill, and the blessing shows on every open.

**Fix**
- Call conferences "Conference" (or the event's name) and keep "series" for teaching series.
- Pass the path when a one-teaching series opens its sermon.
- Use "sermons" everywhere except a series' count.
- Retitle the Paths tab, for example *Paths and teaching series*.
- Make "See all" always open a list page.
- Use one path card, one sermon row and one sermon tile.
- Make the blessing's Continue a pill.

### 10. The search loader's "progress" lines are on a timer

**Where:** `src/search/SearchScreen.tsx:90-94, 354-365`.

**What users see**
- The line moves on at fixed times, whatever the server is doing:
  - 0.4 s: "Understanding what you're going through…"
  - 1.4 s: "Searching 2,850 sermons…"
  - 3.2 s: "Choosing the clearest moments…"
- During each 240 ms change both lines are drawn over each other. (`round-2/10`)

**Why it matters**
- The spec asked for "honest and in order". Timed steps that sound like real work are a familiar AI-app habit.
- The artwork fan is good and approved. The words are the part that pretends.

**Fix**
- Show one line, "Searching 2,850 sermons…", then "Taking longer than usual…" at 8 seconds.
- Or move each step on when the server reaches it. The function already times each stage.
- Fade the old line out before the new one comes in.

### 11. Operations: the CLI can't apply migrations, and email sign-in will hit an hourly cap

**Migrations**
- The 13 migrations in the database are recorded under different version numbers from the 13 files in `supabase/migrations/`, and in a different order.
- So `supabase db push`, which the README offers, will refuse until the history is repaired.
- Today the only working route is pasting SQL into the editor by hand, with an order that `supabase/functions/README.md:179` calls fragile.
- Functions and the web holding page are deployed by hand from the Mac. CI only checks code.

**Pipeline**
- The transcripts, passages, embeddings and curated moments come from a pipeline outside this repository (`curated-sermons/pipelines/...`).
- If the Mac is lost, so is the way to rebuild search.

**Sign-in surge**
- Supabase's built-in email sender is limited to a few messages an hour (`supabase/README.md:70`), and there is no sign that custom SMTP is set up.
- At a launch, email codes will stop arriving after the first handful. The app then says "Too many attempts. Wait a minute", which is wrong for an hourly limit.
- Apple and Google sign-in are not affected.

**Fix**
- Run `supabase migration repair` once so the CLI and git agree.
- Deploy functions and migrations from a GitHub Action.
- Put the pipeline in a private repository.
- Set up custom SMTP before inviting more testers.

### 12. Duplicate and unused code grew back

**Numbers** (from the code-smell pass)

| Item | Count |
|---|---|
| Button components | 22 (was about 16) |
| State or error cards | 3 |
| Bottom sheets | 2 |
| Corner radius values | 13 |
| Shadow styles | 23 |
| Font sizes on screen | about 21 |
| Hard-coded colours outside the theme | 5 |
| Unused lines | about 820 (for example `continueWatching.tsx`, `kit/DayTimeline.tsx`, `kit/moments.tsx` MomentCard, most of `topics.tsx`) |
| Live duplicate lines | about 450 (three copies of the save toggle, three of the "rise" animation, the join screen's own web sheet) |

Two other leftovers:
- `src/catalogue/parseTitle.ts` (812 lines) is used only by the import script.
- About 14% of lines are comments, and many tell the story of the design ("as the owner asked", "the concept", dated notes) rather than why the code is the way it is.

**What users notice:** slightly different buttons, sheets and error cards from screen to screen. That reads as "assembled", not "made".

**Fix:** one clean-up pass.
- Delete the unused code.
- Fold CalmState into StatePanel and FlowButton into Button.
- Draw the join sheet with PathSheet.
- Keep only the spec's radii and four shadows.
- Move `parseTitle.ts` to `scripts/`.
- Strip comments that only say where something came from.

---

## The checklist from the video, applied to AAO

| Smell | AAO now | Evidence |
|---|---|---|
| Supabase everywhere | Accepted (owner decision), with one cost | Auth, catalogue, search, rate limits, quotes and blessings all run in one Supabase project. The rate limiter takes a single database lock for every new search, a bottleneck at volume. |
| AI badges on cards | Mostly fine | The sparkle on search stays (owner decision). It also marks "Key moment" in path days and teaching series, which aren't AI. That dilutes it. Use a plain mark there. |
| Three websites jammed together | Partly | Home mixes a dark cinematic hero, ivory rails and dark path cards. Account is a stock settings list with icons in circles. Onboarding is a third style of radio cards. |
| Mismatched layouts, fonts, colours | Partly | About 21 font sizes, 13 corner radii, 23 shadows, and about 40 one-off colours outside the theme (35 `rgba()` values, 5 hex). Five tab-title patterns. |
| Excessive emoji | Fixed | None in the interface. |
| Samey UI text | Partly | Still generic: "You're all set", "Get started", "Explore first", "Something went wrong", "Welcome back". "Check your connection and try again" appears 11 times. Specific and good: the blessing, the path "why" texts, the care card. |
| Excessive comments | Open | About 14% of lines. 65 mention "concept" and 12 carry dates. |
| Too many loops | Mostly fine | The sign-up gate polls every 100 ms for up to 8 seconds. Path sync retries every minute while anything is pending. The loader lines are on timers. No unbounded polling. |
| Code in the wrong place | Open | The title parser sits in the app but only the import script uses it. Search's 931-line screen builds its own row model. `ui.tsx` is a 1,320-line grab bag. |
| Over-engineering simple things | Partly | Two progress-saving systems and three ways of calling the server. A measure-and-retry loop fits the hero title. The blessing's open logic reads the page address and `navigator.webdriver`. |
| Missing domain depth | Open | Topics are empty (finding 5). Results don't name the speaker. Nothing says what a 2- to 3-hour video costs in mobile data. There is no audio-only way to listen (YouTube rules this out for now). The 253 hand-picked moments are never used. |

---

## Old findings: what changed

| Finding (15–16 Oct) | Now | Evidence |
|---|---|---|
| Distress search fails open when the list misses and the model fails | **Partly** | Fails closed only on a list match (`search/index.ts:496, 515`; `round-2/01`). |
| List misses "tired of living", "I can't go on", Pidgin, French, Portuguese, Swahili | **Open** | All still miss. Only "je veux me suicider" and "I wan kill myself" match. |
| Wrong answers cached 24 h | **Partly** | List matches can't be cached wrong. Model misses are cached 24 h, and cache hits don't re-check. |
| Devotional phrases flagged | **Partly** | "Die to self" and "die to the flesh" pass. "Die to my flesh", "die daily" and "ready to die for Christ" still get the card (`round-2/02`). |
| 20 per caller per 5 min but 300/h shared; quotes 30/h | **Open** | Unchanged. |
| Guests counted per IP from a forgeable header | **Open** | Left-most `x-forwarded-for` (`_shared/auth.ts:42-45`). |
| Chip taps call OpenAI | **Partly** | No chat model now, but still one embedding each, cached 24 h only. |
| About 30 s splash offline | **Open** | About 25 s, and it now opens signed out. |
| Player abandons slow videos at 15 s | **Open** | `PlayerProvider.tsx:474-479`. Manual retry only. |
| No Supabase timeouts | **Partly** | Catalogue, functions and REST now time out after 10 to 25 s. The Supabase client (sign-in, profile, saves) still has none. |
| Dropped watch-position saves | **Open** | `AccountProvider.tsx:405, 413-414`. |
| First catalogue download all-or-nothing | **Partly** | The newest 200 come first. The rest is still all-or-nothing, with no resume and the 200 not kept. |
| Web icons as SVG | **Fixed** | Tab and interface icons are drawn glyphs. |
| Topics hollow; onboarding asks for topics | **Open** | 4 of 2,850 sermons. Now also drives the first recommended sermon and a disclaimer on Home. |
| "Series" means conference and teaching series | **Open** | Plus a one-teaching series opening on a conference label (`round-2/05`). |
| "Library" vs "Saved" | **Fixed** | "The library" is All sermons. Saved is saved. |
| Draft wording | **Fixed** | No draft labels. "Order set by the ministry" appears only when a path is published, and all 13 live paths and series are drafts, so it never shows live. |
| Three sermon-card styles | **Regressed** | Five on Home, about 11 across the app. |
| Three meanings of "See all" on Home | **Regressed** | Four. |
| "No analytics" vs Sentry traces at 10% | **Open** | `privacy.tsx:118`, `monitoring.ts:17`. |
| Contact placeholder | **Fixed** | support＠aaolearning.com on Privacy, Terms and the holding page. |
| Delete screen says topics stay on device | **Open** | `account/delete.tsx:125` vs `AccountProvider.tsx:643`. |
| About says words are "the Apostle's own" | **Open** | `about.tsx:45`. |
| No alerting (OpenAI balance, uptime, handled errors) | **Open** | No `captureException`, no alert, no uptime check. |
| Polling and sleeps in the sign-up gate | **Open** | `auth/gate.tsx:152-167`: 100 ms loops. The intent is dropped silently on timeout. |
| Two progress-sync engines | **Open** | Watch progress (in memory, lossy) vs path progress (kept, with retry). |
| "Today's day" computed in about 9 places | **Partly** | One rule (`learning/progress.ts:86`), re-derived at about 7 call sites with different fallbacks. |
| Three server-call stacks | **Open** | The Supabase client, the catalogue's own fetch, and `fetchWithTimeout`, which never refreshes the sign-in token. So a signed-in person can search as a guest. |
| Per-second re-renders on the sermon page | **Fixed** | Small leftover: each 15-second save redraws the page. |
| Path-sync retry every minute forever | **Partly** | Backs off, but still every 60 s for as long as anything is pending. |
| About 780 lines of dead or duplicate UI | **Regressed** | About 1,270. |
| About 16 button components; three state cards; two sheets | **Regressed / Open / Open** | 22; 3; 2. |
| 7 radii and 27 shadows | **Regressed / Partly** | 13 corner radii; 23 shadows. |
| Paths masthead "Guided journeys, one message a day" | **Open** | `paths.tsx:340-345` (`round-2/06`). |
| Auto-italic last word ("Day 22") | **Open** | Now on every sermon title in the hero and on the sermon page (finding 7). |
| 12pt text in search results | **Fixed** | Nothing in search is under 13pt. |
| Three heading patterns across tabs | **Open** | Five. |
| Avatar drawn two ways | **Open** | `kit/buttons.tsx:303` vs `account.tsx:214-249`. |
| Welcome button shape | **Regressed** | The blessing's Continue now copies it (`BlessingScreen.tsx:308`). |
| Care screen "His teaching couldn't load" | **Open** | `search/care.ts:37` (`round-2/03`). |

**Changes since the first audit, checked:**
- Draft labels are gone. **Fixed.**
- Tab icons are drawn glyphs. **Fixed.**
- The blessing has its own screen with Continue. **Works.** See finding 8 for the wall.
- Path day rows wrap between words. **Fixed.**
- Start here names Day 1 by its theme ("Day 1 · Lay aside every weight"). **Fixed.**
- Google's native sheet on iPhone. Not checked: this audit ran on the web only.
- The title parser keeps acronyms. Not re-checked: tests exist.

---

## What bites as you grow

**Search and the shared allowance**
- 300 new searches an hour for the whole world, 20 per 5 minutes per Wi-Fi, 30 quotes an hour.
- Repeats of the same words within 24 hours are free. Everything else counts.
- A service, a conference or a social media post will hit the ceiling in minutes. When it does, everyone sees "Too many searches", including someone in distress.

**OpenAI balance**
- One empty balance stops every new search, and nobody is told.
- The quotes model is a second, separate cost with a ceiling of 30 an hour.

**Church Wi-Fi**
- Guests are counted per IP address, so 200 people on one router share one guest's allowance.
- Signed-in people have their own allowance. But search reads the sign-in token straight from storage and never refreshes it (`src/learning/session.ts`), so with an expired token a member searches as a guest.

**Crisis handling**
- See finding 1. This one matters most and costs least to fix.

**Weak networks**
- About 25 seconds of splash offline, then signed out.
- Watch positions lost on a bad connection.
- The player gives up at 15 seconds.
- First download needs about 110 kbps sustained.
- Artwork fallbacks look broken (finding 8).

**Data cost**
- Paths play whole sermons (owner decision). The path page tells a newcomer "About 18 hours in all" next to *Start here*.
- On YouTube's default quality a 2-hour sermon is hundreds of megabytes of mobile data, often over a gigabyte.
- Nothing in the app mentions it. Consider a one-line note on the first Watch over mobile data, and show the key moment first.

**YouTube**
- Every sermon, thumbnail and the player come from YouTube.
- A removed or private video shows "This sermon is private or has been removed" with no way forward. Paths can't drop it, because path days block deleting a sermon.
- The import never removes sermons.

**Operations**
- One Supabase project for everything, with no staging.
- Migrations pasted by hand, and a migration history the CLI can't use.
- Functions deployed by hand, and the search pipeline outside git.
- No alerts.

**Sign-in surges**
- Email codes stop after a few an hour until custom SMTP is set up.
- Apple and Google are fine.

**Compute (Medium vs Small)**
- The live database is 773 MB. What search needs in memory is the passages table (208 MB) and its vector index (192 MB), about 400 MB.
- Small has 2 GB of memory, Medium 4 GB, so the search index fits in Small with room to spare.
- Today's load is one account and about 72 new searches a day.
- I could not see CPU or memory graphs. On this evidence Medium isn't needed during TestFlight.
- A fair test: switch to Small for a week and watch search times in the function's own timing logs. Go back to Medium if the slowest searches pass about 1.5 seconds, or on launch day.

---

## Minimal plan

**Fix now (before more testers; about 2 to 3 days)**

1. **Distress handling** (finding 1).
   - One shared list with the missed wordings and three languages.
   - Show the card when the "maybe" list matches and the AI step fails.
   - Narrow the devotional false positives and strengthen the model's instruction.
   - Check before the rate limit, re-check on cache hits, and test with the phrase table.
2. **Copy.**
   - Replace "His teaching couldn't load just now" with "Teaching couldn't load just now. The helpline above is there now."
   - Fix the four trust sentences (finding 6).
   - Set `tracesSampleRate` to 0, or say what's sent.
3. **Titles.** Remove `italicLast` from sermon titles (finding 7).
4. **Sermon page.** Stop the fallback title sitting under the play button (finding 8).
5. **Alerts.** Send handled search failures to Sentry and alert on OpenAI quota errors (finding 3).
6. **SMTP.** Set up custom SMTP.

**Before public launch**

1. **Search capacity** (finding 2).
   - Spending limit as the real ceiling, higher global count.
   - Right-most IP for guests, precomputed chips.
   - Curated moments as the fallback.
2. **Weak networks** (finding 4).
   - Launch restore with a 2-second limit.
   - Save queue kept on the device.
   - Supabase client timeout, one automatic player retry, a resumable first download.
3. **Topics** (finding 5): remove them or replace them with needs.
4. **Names and looks** (finding 9).
   - Conference vs teaching series, and a one-teaching series that keeps its context.
   - Paths heading, one meaning of "See all".
   - One path card and one sermon row and tile, a pill Continue on the blessing.
5. **Loader line** (finding 10): one honest line.
6. **Blessing wall:** check it with real artwork at 1440 wide, and drop the blur if it reads as loading.
7. **Operations** (finding 11): repair the migration history, deploy from CI, put the pipeline in a private repository.
8. **Clean-up pass** (finding 12).

**Leave alone**
- These owner decisions: Supabase and Supabase Auth, the sparkle on search, whole sermons on paths, the blessing's own text-only screen, the holding page, and the deferred custom domain.
- The artwork fan in the loader.
- The title parser's logic: it is tested and needed. Just move it to `scripts/`.
- Bounded loops (the code-resend countdown, the account refresh back-off).
- Laptop layout details: back and share buttons at the window edges, and the corner mini-player covering "See all". The public web is a holding page.
- Medium compute until you have launch numbers (or try Small during TestFlight, as above).
- The padlock on the next path day. It contradicts the design's own "no padlocks" principle, but "Open Day 4 anyway" softens it. Worth a decision rather than a fix.

---

## Screenshots

All are from the local web app with YouTube blocked, so the artwork is the app's fallback.

| File | Shows |
|---|---|
| `round-2/01-distress-missed-when-search-fails.jpg` | "I'm tired of living" while search is failing: no care card. |
| `round-2/02-devotional-phrase-gets-crisis-card.jpg` | "I want to die to my flesh" gets the crisis card. |
| `round-2/03-care-card-when-search-fails.jpg` | Care card holds on failure. "His teaching couldn't load". |
| `round-2/04-sermon-italic-title-and-artwork-fallback.jpg` | Day Two *Morning*. The fallback title under the play button. |
| `round-2/05-one-teaching-series-lands-on-conference.jpg` | "Seeking the face of God" (1 teaching) opens a page about "Apostolic Shift 2026". |
| `round-2/06-paths-masthead.jpg` | "Guided journeys, one message a day". |
| `round-2/07-home-member-topics-disclaimer.jpg` | From your topics with the sample-labels note. |
| `round-2/08-onboarding-done-demo-starter.jpg` | "You're all set" with a demo-tagged starter. |
| `round-2/09-blessing-laptop-artwork-not-loaded.jpg` | Blessing at 1440 with artwork not loaded. |
| `round-2/10-search-loader-lines-overlap.jpg` | Two loader lines drawn over each other. |
| `round-2/11-path-day-padlock.jpg` | Member path page: Day 4 locked. |
| `round-2/12-account-guest.jpg` | Settings rows with icons in circles; "Watch every sermon in full". |
| `round-2/13-home-guest-320.jpg` | 320 wide: "START HERE · 7 / MESSAGES" splits the number from its word. |
| `round-2/14-home-guest-390.jpg` | Hero "Pray Without *Ceasing*". |
| `round-2/15-docked-player-390.jpg` | Docked player at 390 (YouTube's 200pt minimum makes it large). |
| `round-2/16-search-results-fallback-tiles.jpg` | Result tiles cut off mid-word. |

---

## Appendix: distress phrases against the live keyword list

Tested with the exact pattern in `prompts.ts:59-60` (the app's copy is identical).

| Phrase | Matches? |
|---|---|
| I want to die / I want to kill myself / suicidal / end it all / no reason to live / better off dead / self harm / cutting myself | Yes |
| I wan kill myself / je veux me suicider | Yes |
| tired of living / I'm tired of living | **No** |
| I can't go on / i cant go on anymore | **No** |
| I hate my life / nobody would miss me | **No** |
| I wan die / I don tire for this life / wan comot for this world (Pidgin) | **No** |
| je veux mourir (French) | **No** |
| quero morrer / vou me matar (Portuguese) | **No** |
| nataka kufa / najiua (Swahili) | **No** |
| die to self / dying to self / kill the flesh / how to die to sin | No (correct) |
| death of a loved one / my father died / grief | No (correct: grief, not crisis) |
| I want to die to my flesh / I want to die daily / ready to die for Christ | **Yes (false positive)** |
| suicide prevention sermon / killing myself slowly with sin | **Yes (false positive)** |
