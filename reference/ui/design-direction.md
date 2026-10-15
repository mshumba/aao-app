# AAO: design direction for the inside of the app

14 October 2026. This is a proposal for the builder to follow.

**What is approved and what isn't.** The owner has approved the ivory-and-navy look and loves the welcome screen. Everything else here is a recommendation and needs the owner's OK before it ships: the tab set, the new type roles, Paths and Moments.

> **Critic: review, 14 October 2026.** An independent pass compared this direction, the three concepts and the board with the current app screenshots (`../shots/`) and the welcome. Additions are marked "Critic:" throughout.
>
> **Verdict.** Yes, this lifts the inside of the app from template to something that belongs with the welcome. The wall thresholds, the serif voice with one italic phrase, quotes you can play and the dark stage over an ivory panel all match the welcome's grammar, and the concepts already read at the level of Hallow, Abide and Dwell. Three things stand between this and "fabulous":
>
> 1. **The showpieces depend on content that doesn't exist yet.** Today the app has 4 verified sermons (1 Lioness Conference, 3 Apostolic Shift). It has no transcripts, no verified moments, no paths, and topic labels nobody has reviewed. The concepts and the board's wall use a different set of sermons from the unapproved `Curated Sermons` folder (Behold the Man, The Call to Consecration and others), and much of their richness comes from that variety. Under this document's own honesty rules, need chips, quotes, A word for today and Paths all disappear at launch. **New: §5 "Launch state"** specifies a Home, Search, sermon page and Library that look designed with the 4 sermons alone.
> 2. **It is still a template in places.** Home stacks eight sections of rails, the section headings are Netflix nouns, Library is a grid of icon tiles, the tab bar is a hand-made copy of the system's glass bar, and nothing moves in a way only AAO would. Fixes: a Home budget and section headings in the ministry's voice (§5 Home), Library tiles built from your own artwork (§4 LibraryTile), Search opening on the question at welcome size (§5 Search), the native iOS tab bar with the mini player in its accessory slot as an option (§4 TabBar), and one signature motion, "Find the minute" (§3.8).
> 3. **A few specs can't be built as written, or would hurt accessibility.** The round buttons over the stage would sit on YouTube's controls once the embed plays. A React Native `TextInput` can't give its placeholder a different font. Fixed heights would clip at 200% text. The colour rule contradicts its own PathTodayCard. iOS lock-screen artwork is square. The app is locked to portrait, so 3-hour sermons can't be watched sideways. Fixes: §3.1, §3.3, §3.5, §3.6, §3.9 (new), §3.10 (new), §4 Header and SearchField, and §5 Sermon page.
>
> **Missing screen families, now added:** the launch state, the topic page, "See all" lists, sharing a moment as an image or link, opening a shared link at a timestamp, fullscreen and landscape, lock-screen Now Playing, and the email and code sign-in screens. Open questions for the owner are collected at the end of the document.

**Sources**

- Six screen families of Appllama research: player, library, browse/paths, search, details/states and profile.
- The Home references the concept agents downloaded, copied into `home/` and `paths/`.
- The three rendered concepts, snapshotted into `concepts-snapshot/` (editorial, immersive, devotional).
- The current app screenshots in `../shots/`, `src/theme.ts`, `src/onboarding/ArtworkCollage.tsx`, and AAO's own sermon artwork.
- *Critic:* added after the critic pass:
  - three quote-sharing screens in `share/` (5 Minute Journal, Bible Note, Glorify);
  - `browse/wiser-topic-detail.png`;
  - a check of `package.json`, `app.json`, `src/data/*` and `src/player/Embed.tsx`.

All image paths below are relative to this folder. Ignore the Appllama watermark in the top-left of every reference. Take structure and proportion from other apps, never their branding, colour or copy.

**Board.** `board/index.html` shows every reference grouped by screen, with the takeaway for each group.

---

## 1. The idea

**A gallery wall, and his voice.** Apostle Osayi's sermon artwork is loud. It uses near-black grounds washed in teal and orange light, huge condensed capitals, and the Apostle photographed mid-sentence at the microphone. The welcome screen works because it doesn't compete with that. It uses the artwork as material, a wall of the real posters tilted at -8°. Then it goes quiet: an ivory page, one serif sentence with one italic word, and one navy button.

The inside of the app keeps the same rule. The artwork brings all the colour and energy. The frame is ivory, white and a little sand, and the voice is Newsreader. Every main screen opens with one big moment (a "threshold") and then hands over to calm type and lists:

- On Home, a band of the wall.
- On a path or series, a wall made of its own sermons.
- On a sermon, the stage.

The welcome's two small devices become the grammar of the whole app. The first is the **italic word**: "Teaching that *builds* you up" becomes "Good morning, *Mufaro*", "What are you *going through*?" and "Breaking free from *habitual sin*". The second is the **navy rule** next to the wordmark. It now means *you are here*: today's day in a path, the moment that is playing.

AAO's search finds moments inside sermons, not just whole sermons. So the Apostle's own words become the app's second image: a verified quote set in Newsreader, with a timestamp you can press to play from there. Inside, the app is made of his artwork and his words, not of our boxes.

All three concept explorations (`concepts-snapshot/*/concept.png`) arrived at this independently. They share:

- the serif greeting with an italic name;
- "What are you going through?" as a serif-italic field with need chips;
- a path card built from fanned artwork;
- results that are quotes with "Play from 36:50";
- a path page with a ministry-ordered day timeline;
- a sermon page that knows its moments.

This document turns that convergence into a system and settles the places where the three concepts disagree (§7).

## 2. Principles

1. **Let the artwork be loud and keep the frame quiet.** Colour comes only from sermon artwork. The UI uses ivory, white, sand, one navy and a little gold. Never tint a page to match its artwork and never add a hue.
2. **His words are the second image.** Where other apps show stock photos, AAO shows the Apostle's quote in Newsreader with its timestamp, and every quote can be played. Every quote must come from a reviewed transcript at a real timestamp. If none exists, show nothing. Never invent, trim the meaning of, or paraphrase his words.
3. **One threshold per screen, then calm.** One large artwork or serif moment at the top, then quiet type and rows. No screen has two heroes. No white card is wrapped around artwork.
   - *Critic:* this rule means no white mat around a lone hero image, like today's Featured card (`../shots/06-home-member.png`). Cards whose job is text, with a thumbnail inside (ContinueCard, MomentResult, BestMatchCard), are allowed. On BestMatchCard the artwork is the card's top edge, flush and clipped by the radius, never inset with a white border around it.
4. **Every play control says how long.** Sermons run 1.5 to 3.5 hours, so time is what people decide on. Put the duration, the time left, "at 34:12" or "16-min focus" on or next to every play control.
5. **Start from what the person is going through.** Ask "What are you going through?" before showing categories. Lead with moments before whole sermons and with paths before the archive. The ministry's choices are named as such ("Order chosen by the ministry").
6. **Show only what exists, honestly.** No empty shells, zero counts, streaks, premium badges, padlocks or urgency. Empty states say what will happen. Errors say what to do next.
7. **Make it readable by everyone, on any network.** Body text is at least 15pt, contrast at least 4.5:1, and touch targets at least 44pt. Dynamic Type works up to 200% without clipping. Placeholders match the final layout, and artwork fades in.
   - *Critic:* many components below specify fixed heights (28pt pills, 40pt chips, 120pt topic cards, 56pt mini player). Read every height in §4 as a **minimum** (`minHeight`), not a fixed size. The behaviour at large text sizes is in §3.9.

---

## 3. System

### 3.1 Type

There are two families, each with one job.

- **Newsreader is the voice.** It speaks *to* the person: greetings, questions, path and series names, section headings, quotes, and the title of the sermon you are on.
- **Manrope is the interface.** It covers sermon titles in lists, labels, metadata and controls.

Verified sermon titles are never uppercased, re-tracked, shortened or given an italic word, in either family.

| Role (`type.*`) | Font | Size / line height | Tracking | Use |
|---|---|---|---|---|
| `hero` (exists) | Newsreader 500 | 38/42 | -0.6 | Welcome, onboarding "done" |
| `title` **new** | Newsreader 500 | 32/38 | -0.5 | Root greetings and page titles: "Good morning, *Mufaro*", "Paths", "Library"; path and series names on their covers; the name on Account |
| `question` (exists) | Newsreader 500 | 30/35 | -0.4 | The Search prompt, onboarding questions, the sign-up sheet headline |
| `sermonTitle` **changed** | Newsreader 500 | 30/36 | -0.4 | **Only** on the sermon page and Now Playing. All three concepts set it this way and it reads as a page, not a list item. No italic word inside it. |
| `section` **new** | Newsreader 500 | 24/30 | -0.3 | Section headings ("Continue watching", "Moments in this sermon"); path names inside cards |
| `quoteLarge` **new** | Newsreader 500 *Italic* | 24/32 | -0.2 | Short display quotes, three lines or fewer: "A word for today", the Listen stage, Day complete |
| `quote` **new** | Newsreader 500 (upright) | 19/28 | 0 | Moment quotes in cards and results, up to 5 lines. Upright because italic tires the eye after two lines. |
| `quoteSmall` **new** | Newsreader 500 (upright) | 17/25 | 0 | Quotes inside rows: Moments list, path days |
| `stateTitle` **new** | Newsreader 500 | 24/30 | -0.3 | Titles of empty, error and offline states |
| `cardTitle` **new** | Manrope 700 | 17/22 | -0.1 | Sermon titles in rails, rows, continue cards and day rows. Two lines maximum, ellipsis at the end. |
| `heading` (exists) | Manrope 700 | 19/26 | 0 | Sheet titles only |
| `lead` (exists) | Manrope 400 | 16/25 | 0 | Descriptions under titles |
| `body` (exists) | Manrope 400 | 15/24 | 0 | Running text |
| `label` (exists) | Manrope 600 | 15/21 | 0 | Buttons, list labels, chips |
| `labelSmall` **new** | Manrope 600 | 13/18 | 0 | Time pills and timestamp chips, with tabular figures |
| `caption` (exists) | Manrope 400 | 13/19 | 0 | Metadata: "Dr Arome Osayi · 10 Sep 2026 · 2 hr 37 min" |
| `meta` **new** | Manrope 600 | 12/16 | 0.1 | Duration chips on artwork, tabular figures |
| `kicker` (exists) | Manrope 700 | 12/16 | 0.6, uppercase | Eyebrows, written in sentence case in the data |
| `tab` | Manrope 600 | 11/13 | 0 | Tab labels |

**Retire `display`** (Manrope 800, 30/36). The generic bold page titles ("Topics", "Search", "Account") are a large part of why the inside of the app feels like a template.

**The italic-word rule.** In a `hero`, `title`, `question`, path name or series name, set at most **one phrase of one to three words** in `font.serifItalic`, at the same size. Choose the word that carries the meaning: the person's name ("Good morning, *Mufaro*"), the need ("What are you *going through*?") or the turn in a path name ("Breaking free from *habitual sin*"). Path and series names are editorial, so the italic is chosen in the CMS, never guessed by code.

Never use the italic word in sermon titles (immersive's "Can You Lose Your *Salvation?*" is out), in buttons, or twice on one screen.

**Where serif never goes.** Never set Newsreader below 17pt. Never use it for buttons, tabs, chips, metadata, list labels or sermon titles in lists. Use at most one block of running serif text per screen (the path's "Why this path" is that block).

**Numbers.** Every time, duration and count that can change while you watch it uses `fontVariant: ['tabular-nums']`.

**Dynamic Type**

- Set `maxFontSizeMultiplier` to 1.3 on `hero`, `title`, `question` and `sermonTitle`, and to 1.5 on `section` and the quote roles. Body, label and caption are uncapped.
- Serif titles wrap and are never truncated. Sermon titles truncate at two lines in rows only.

**Critic: tightening the scale.**

- **Fewer near-duplicates.** `stateTitle` is identical to `section` (24/30), so use `section` and drop the extra name. `question` (30/35) and `sermonTitle` (30/36) are one size: give both 30/36. The serif steps are then 38 · 32 · 30 · 24 · 19 · 17, and each step is visibly different.
- **Section headings speak in the voice.** If every heading is Newsreader, the serif stops being "his voice" and becomes just the heading font, which is the devotional-app trope. Keep serif section headings, but write them as phrases a person would say, not category nouns (§5 Home lists the copy). Search's results header ("Moments that speak to this", Manrope 700 17) stays sans because it labels a list, not a greeting. That is the rule: serif for what is said to you, sans for what labels a list.
- **Quote punctuation.** Use curly quotes and a real ellipsis (…). In quote blocks of two or more lines, hang the opening quote mark outside the text column: render "“" as a separate absolutely positioned `Text`, offset left by its own width (about 0.45em), so every line of the quote starts on the same edge as the title above. Join the timestamp to the word before it with a non-breaking space ("at 34:12" never breaks).
- **Bold Text.** iOS's Bold Text setting doesn't reach custom fonts. Read `AccessibilityInfo.isBoldTextEnabled()` and its change event, and step each role up one weight: Manrope 400→600, 600→700, and Newsreader 500→600 (`serifSemibold` is already loaded).
- **Optional: a display cut of Newsreader.** The `@expo-google-fonts/newsreader` files are single static instances at the text optical size. At 30pt and up, an instance cut at a display optical size has finer contrast and tighter fit, closer to editorial print. The variable font is OFL, so a 500 and 500 Italic display instance can be made with fontTools' `instancer` and loaded for `hero`, `title`, `question`, `sermonTitle` and `quoteLarge` only. Compare the two side by side on the welcome first. The owner already loves the current rendering, so adopt it only if the difference is visible to him.
- **The placeholder font (feasibility).** A React Native `TextInput` draws its placeholder in the same font as typed text; only `placeholderTextColor` differs. To get a serif-italic prompt over Manrope input, draw the prompt as an overlaid `Text` (`pointerEvents="none"`, hidden from accessibility) while the value is empty, and keep the real `placeholder`/`accessibilityLabel` on the input so screen readers still hear "What are you going through?". Don't swap `fontFamily` on the first keystroke: the line box jumps.

### 3.2 Spacing

The scale is **4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64**. In `theme.ts`, add `s20: 20`, `section: 40` and `huge: 64` to `space`.

| Where | pt |
|---|---|
| Page gutter (every page, sheet and onboarding step) | 24 |
| Between sections (Home, Library, Path, Series, sermon page) | 40 |
| Section header to its content | 12 |
| Kicker to title / title to meta | 6 / 4 |
| Meta to the action row | 16 |
| Threshold (cover or stage) to the first text | 16 to 24 |
| Rail: leading inset, gap, trailing inset | 24 / 12 / 24 |
| Card padding, compact / featured | 16 / 20 |
| Row vertical padding; thumbnail to text | 12; 16 |
| Bottom of any scroll view | tab bar + dock + 32, or the sticky CTA + 24 |

The theme.ts rule stays: the gap between groups is at least double the gap inside them. On ivory, space separates rows. Draw dividers only inside a white grouped container, using `c.divider` and inset to the start of the text.

### 3.3 Radii

| Thing | Radius |
|---|---|
| Artwork | by size, see §3.6 (16, 12, 10, 8, 6 or 4) |
| White cards: continue, result, moments list, today's day | 16 |
| Sand cards: path today, word for today, topic, series, "part of a path" | 20 |
| Full-width buttons, 52 to 56pt | pill (all three concepts use pill CTAs, and they match the 999 token) |
| Inline controls of 44pt or less: chips, time pills, timestamp chips, "Saved" and "Share" | pill |
| Duration chips on artwork | 6 |
| Sheets, and the ivory panel over the sermon stage (top corners) | 24 |
| Mini player | 28 |

Note that this changes full-width buttons from radius 12 to a pill. Do it everywhere at once, including onboarding and sign-in, so that one shape means "button".

Nested corners equal the outer radius minus the padding.

*Critic:* that rule breaks wherever the padding is at least the radius. PathTodayCard (radius 20, padding 20) would give its inner white card a square corner, yet the spec gives it 16. Use: inner radius = outer radius − padding when the padding is smaller than the radius; otherwise 12. So the inner "play today" card in PathTodayCard is radius 12. Artwork keeps its ladder radius (§3.6) wherever it sits.

### 3.4 Elevation

There are four levels. Write them as React Native 0.86 `boxShadow` strings, the same way `toast.tsx` and `tabBar.tsx` already do.

| Level | Surface | Border | Shadow |
|---|---|---|---|
| 0 Page | `c.bg` | none | none |
| 1 Card | `c.surface` | hairline `c.border` | `0 1px 3px rgba(27,30,36,0.05)` |
| 2 Floating: tab bar, mini player, toast, sticky CTA, round buttons over artwork | `c.raised` | hairline `c.border` | `0 8px 24px rgba(27,30,36,0.12)` |
| 3 Sheet | `c.raised`, top radius 24 | none | `0 -8px 32px rgba(27,30,36,0.16)`, backdrop `rgba(17,20,26,0.32)` |
| Art (cover tiles, the front card of a fan, the Home "new" rail) | the artwork | inner hairline `rgba(15,17,21,0.08)` | `0 6px 18px rgba(15,17,21,0.18)`: the "printed poster" lift from the welcome wall |

Sand cards are flat, with no border and no shadow; the sand alone separates them. Row thumbnails get a hairline and no shadow.

### 3.5 Colour usage

**Navy is you. Gold is the ministry's voice.**

- Navy marks the person: their actions, their selection, their progress, where they are.
- Gold marks what the ministry chose: kickers, the rule beside a quote, a path day's focus segment on the scrubber.

*Critic:* the slogan contradicts the spec. "YOUR PATH · DAY 3 OF 7", "FROM YOUR TOPICS" and the date kicker are all about the person, yet they are gold. A builder will hit this on the first card. The rule the spec actually follows is: **gold is a label colour; navy is for what you can act on and where you are.** All kickers on ivory and white are gold, whoever they are about. Anything you press, anything selected, and any progress or "here" marker is navy. The gold focus segment and the gold quote rule are the two places where gold also carries the ministry's meaning, so keep the slogan for those two and use the rule above everywhere else.
| Token | Value | Use | Never |
|---|---|---|---|
| `c.bg` ivory | `#f7f4ee` | Every page | Inside sheets (sheets are white) |
| `c.surface` white | `#ffffff` | Continue card, result cards, moments list, today's day, the inner "play today" card, search field, sheets, tab bar, toasts | As a frame around artwork |
| `c.feature` sand | `#efe9de` | Path today card, word for today, topic, series and "part of a path" cards, chips, time pills, timestamp chips, icon wells, placeholders | Gold small text on it (4.38:1). Kickers on sand use `c.mutedOnFeature` (6.22:1) or navy. |
| `c.featureOnSurface` **new** | `#f3eee5` | Chips and pills sitting on white cards | n/a |
| `c.accent` navy | `#1f3a5f` | The primary action of each section (one filled navy control per card or section), selected chips and tabs, progress, links, the "here" rule, focus ring, the avatar | Backgrounds of cards or sections. Immersive's and devotional's navy "A path for this" cards become sand. |
| `c.gold` | `#85672a` | Kickers on ivory (4.82:1) or white (5.29:1), the quote rule, the path focus segment | Sand grounds, body text, buttons, icons, large fills |
| `c.text` / `c.muted` | | Text. Muted is 5.69:1 on ivory and 5.17:1 on sand. | Using muted for anything you must read in order to act |
| `c.track` **new** | `#d8d0c1` | Scrubber and progress tracks, the path timeline, upcoming-day rings, upcoming progress segments | Text. It is decorative (1.40:1); the navy fill carries the meaning (7.5:1 against the track). |
| `c.media` | `#0f1115` | The sermon stage (video, or artwork before play) and the scrubber band under it, fullscreen, loading ground for dark art | Any page background other than that stage |
| `c.scrim` | `rgba(17,20,26,0.72)` | Duration chips and progress tracks over artwork (white on it is at least 7.3:1) | Darkening a whole image |
| `c.error` | `#b3261e` | Destructive text, field errors | Generic load errors (those are calm, in navy) |

The proportion on any screen: about 80% ivory, white and sand; 15% artwork; under 5% navy; under 1% gold.

*Critic: contrast, re-measured (WCAG 2.x).* All the ratios above check out. Also: muted on white is 6.24:1; navy on sand is 9.50:1 and on `featureOnSurface` 9.94:1; gold on `featureOnSurface` is 4.58:1, so it passes but stays out (keep gold off sand-family grounds); the search field's `#878279` hairline is 3.82:1 on white, which passes 3:1 for an input boundary. White at 74% on `c.media` is 10.5:1 and white on the scrim is 7.35:1. Two are tight:
- The dark-only gold `#b8954a` is 3.04:1 against the white-25% track and about 2.9:1 against the white played fill. Its end brackets (shape) and the "Day 3 focus · 1:21–1:37" caption carry the meaning, so it passes 1.4.1. Never let colour alone mark the segment.
- The dashed ghost-card border `#c9bfae` is 1.66:1. That's acceptable only because the ghost card is decorative and its muted icon and label carry the meaning. If a ghost card is tappable, give it a visible label in `c.text` or navy.

*Critic:* the playing MomentRow's `#f3f4f6` is a cool grey, the only one in a warm palette. It risks reading as a stale grey selection. Use `c.featureOnSurface` (#f3eee5) and let the navy chip and the full-height navy rule say "you are here".

The app is light-only for V1. If a dark theme comes later, use ink `#12141a`, not black.

### 3.6 Imagery

AAO's artwork is designed at 16:9 and already carries its own title, so:

1. **Always 16:9.** Never crop it to a square or a circle; that cuts the title or the preacher. Devotional's square series crops and immersive's full-bleed crop of the preacher's face are both out. Mini players and queues use 16:9 thumbnails (64×36).

2. **Never put text or buttons on the artwork.** There are three exceptions:
   - a duration chip in the bottom-right corner;
   - a 4pt progress bar along the bottom edge;
   - on the sermon stage before playback starts, one 64pt play disc in the centre (white at 92%, with a navy glyph). The stage *is* the player there.

   Titles and actions go below or beside the artwork. Immersive's serif title over a cropped photo is out.

3. **Sizes** (390pt phone, 342pt content width):

| Name | pt | Radius | Lift | Where |
|---|---|---|---|---|
| `stageFull` | 390×219 | 0 | on `c.media` | The sermon page and Now Playing stage (the YouTube embed lives here, at least 200pt tall) |
| `stage` | 342×192 | 16 | Art | The Listen-mode stage and the search "best match" |
| `railL` | 264×149 | 12 | Art | "New this week" |
| `railS` | 200×113 | 12 | hairline | Secondary rails |
| `grid` | 165×93 | 12 | hairline | Two-up grids, ghost cards |
| `row` | 128×72 | 10 | hairline | Continue card, result cards, SermonRow |
| `compact` | 96×54 | 8 | hairline | Path days, history, up next |
| `mini` | 64×36 | 6 | hairline | Mini player, sheets, suggestions, "part of a path" |
| `micro` | 48×27 | 4 | hairline | Inline context (sign-up sheet) |

4. **Loading.** Start with the dark `artworkTint` ground and fade the image in over 200ms. If the image fails, keep the tint and show the short headline in Manrope 800 white (the existing fallback).

5. **Duration chip.** Bottom-right, inset 6, `c.scrim`, radius 6, padding 2×6, `meta` text in white. Leave it off wherever a time pill already states the time.

6. **Progress on artwork.** A 4pt bar along the bottom edge, clipped by the radius. The track is `rgba(17,20,26,0.55)` and the fill is white. Count 95% or more as finished.

7. **Generated covers.** AAO has no designed art for paths, series or topics. Their covers are made from their own sermons, using one of three devices, all tilted at the welcome's -8°:
   - **Wall** (`WallWindow`): a cropped window onto the welcome wall built only from the collection's sermons, fading to ivory. Used for full-bleed covers: the Home masthead, path and series pages, onboarding "done". It needs 3 or more distinct sermons.
   - **Fan** (`CardFan`): three tiles. The front tile is straight, at 62% of the box width, with a 2pt white border and the Art shadow. Two tiles sit behind it, rotated -8° and +6° and offset to the left and right by 18% of the box width. Used in cards: path today, series cards, "part of a path", "a path for this". It needs 2 or more sermons; with 1, show a single tile.
   - **Peek** (`TopicCard`): one tile, rotated -8°, sitting at the bottom-right corner of a sand card and clipped by it. It shows about 70% of the tile. Used for topic cards.

8. **Fades only at thresholds.** Artwork fades into ivory only at the top of the welcome, Home masthead, path and series covers. Use the welcome's eased gradient: a wash under the status bar, clear through the middle, then ivory. Never fade artwork into artwork, and never fade the bottom of a card.

9. **The wall settles once.** It settles over 700ms on its first appearance per launch. It never loops, drifts or moves with scroll.

10. **No other imagery.** No stock photography, illustration or emoji anywhere. The Apostle's artwork and his words are the only imagery.

11. *Critic:* **System surfaces that are square.** The iOS lock screen, Control Center, CarPlay and Android's media notification all show square artwork, and they will crop a 16:9 poster to its centre, which cuts the title. For `MPNowPlayingInfo` and the media session, generate a square: the full 16:9 poster centred on a square of its own `artworkTint`, with nothing cropped. The same goes for any square the OS asks for (share previews, a future widget).

12. *Critic:* **A small catalogue repeats.** With 4 sermons, a WallWindow repeats the same posters (the welcome already does). Two rules keep it looking deliberate rather than short of content:
    - No poster sits beside or directly above itself. Offset each row's start index by 2.
    - A wall needs **3 distinct** posters (as specified). Below that, use a single `stage` of the newest one, or CardFan for 2.

    The concepts and the board look richer partly because their walls use a dozen different sermons from the unapproved `Curated Sermons` folder. Judge the launch look with the 4 real posters (§5 Launch state).

### 3.7 Iconography

- **Set.** Ionicons through `@expo/vector-icons` (already in the app). Outline by default; filled only when something is selected or on: the active tab, a saved bookmark, a running sleep timer.
- **Sizes.**
  - 24: navigation and toolbars.
  - 20: leading icons in lists and inline icons.
  - 16: inside chips and pills.
  - 10 to 12: the play glyph inside time pills.
- **Colour.**
  - `c.text` for icons that do something.
  - `c.muted` for decorative and leading icons.
  - `c.accent` for active ones.
  - White on navy.
- **Icon wells.** A 32pt white circle with an 18pt navy icon (library tiles), or a 56pt sand circle with a 24pt navy icon (empty states).
- **Optics.** Nudge the play glyph 1.5pt right inside circles. Keep hit areas at 44pt or more.
- **No sparkle.** Don't use ✦ or other "AI" glyphs (immersive and devotional put one in the search field). If search works by meaning, say so in words under the field: "Searching every message by meaning".
- **No custom microphone button.** The keyboard already offers dictation.
- **The navy rule** is AAO's one custom mark: 4pt wide, radius 2, `c.accent`. It is 22pt tall beside the wordmark. Run full height, inset 12, it marks the playing moment (devotional's "PLAYING" row) or today's day. The current wordmark in `ui.tsx` already draws it at 4×22.

### 3.8 Motion

Theme tokens: `easeOut = cubicBezier(0.23,1,0.32,1)`; press scale 0.97 or 0.98 over 120ms. Use Reanimated 4 and Gesture Handler (see the `animate-expo` skill).

| What | How |
|---|---|
| Press | Scale 0.97 for small controls, 0.98 for cards and rows; 120ms easeOut; no opacity flash |
| Chip select, toggle, segmented thumb | Colour crossfade 150ms; the thumb slides 200ms easeOut |
| Content swap: moment pill, Listen-stage quote, header title appearing | Crossfade 200 to 240ms; the pill also slides 8pt |
| Toast | In over 240ms, rising 12pt from below; out over 180ms. Stays 4s, or 6s if it has an action |
| Sheets, and mini player to Now Playing | Gesture-driven spring, damping 26, stiffness 260 (about 320ms). Dismiss on velocity over 800 or past 30%. The thumbnail morphs from the pill to the stage. |
| Removing from a list | Height collapses over 200ms easeOut, then an Undo toast. Never a confirm dialog for something that can be undone. |
| Save, Save this moment | The bookmark fills and springs 0.85→1 (damping 15, stiffness 220), with a light haptic |
| Progress ring, scrubber, path progress filling after a day ends | Linear 1000ms per tick. After finishing a day, the new segment fills over 400ms easeOut. |
| Artwork load | 200ms fade from the tint |
| Wall settle | 700ms, once per launch (welcome, the Home masthead, a cover on its first view) |
| Screen push and pop | The native stack. Do not customise it. |

**Never animate any of these:** looping or drifting walls, marquee titles, parallax under text, auto-advancing carousels or dot pagers (immersive's Home hero pager is out), confetti, count-ups, skeleton shimmer, animated gradients, bouncing badges, or haptics on scroll.

**Reduce Motion:** every translate and scale becomes a 150ms opacity change. The wall appears without settling, and progress jumps instead of animating.

**Haptics:**

- Selection haptic on choosing a chip and on jumping to a moment.
- Light impact on Save, Save this moment and finishing a day.
- Nothing on navigation.

**Critic: one signature motion, "Find the minute".** The list above says what not to animate. Nothing in it shows what only AAO does: take you to the minute where he speaks to your need. Give that one moment a motion of its own.

- **When:** playback starts from a moment. That covers a search result, A word for today, a MomentRow, a path day's focus, or a shared link with a time.
- **What:** the sermon page opens as usual. On the scrubber band, the thumb travels from 0:00 to the moment's tick over 600ms `easeOut`. That tick grows from 10 to 14pt and goes to full white. The elapsed time shows the moment's time from the start (no count-up, per the list above). When the thumb lands, the matching MomentRow takes the navy rule (200ms crossfade) and a selection haptic fires.
- **Truth:** it is decoration over a real seek. `seekTo` fires at once, and the glide never delays playback.
- **Reduce Motion:** the thumb is simply at the moment, with no travel.
- **Never:** on ordinary resumes, or more than once per open.

*Critic: feasibility of the pill-to-stage morph.* Shared-element transitions in Reanimated 4 are still behind an experimental flag. Don't make the MiniPlayer → Now Playing transition depend on them. Present the sermon page as a vertical sheet-style push (the gesture spring above) and crossfade the artwork. Add a true morph later only if it proves stable on both platforms.

### 3.9 Critic: large text and accessibility contracts

Principle 7 promises 200% Dynamic Type with no clipping, but §4 is written in fixed sizes. These are the rules that keep the promise. Test at the largest standard size and at AX5, using `PixelRatio.getFontScale()` (re-read it when the app returns to the foreground).

**Layout at large text**

| fontScale | What changes |
|---|---|
| any | Every height in §4 is a `minHeight`. Pills, chips, rows, the mini player and the two-line play button grow with their text. Nothing uses `numberOfLines={1}` except tab labels and the mini-player title. |
| ≥ 1.35 | 2×2 grids (TopicCard, LibraryTile, series "See all") become one column. Card widths in rails grow with the text, and rails show 1.1 cards instead of 1.3. The pill pair (Save, Share) wraps onto two lines. In the transport, speed and Up next move to the action row and the main row keeps back · play · forward. |
| ≥ 1.6 | Horizontal rails become vertical lists of SermonRows (stacked, with `useStackedRows`). Fans and peeks shrink to a single `compact` tile beside the text, and the scrubber band's centre caption moves under the times row. |

**Touch targets.** Every control has a 44×44pt hit area, using `hitSlop` where it is drawn smaller: the TimePill (28), TopicTag (32), FilterChip and SegmentedControl (36), the moment pill (32), the search clear button (28), the Library row ellipsis (32), the masthead avatar (36) and the header round buttons (40). Adjacent targets keep at least 8pt between their drawn edges so their hit areas don't overlap. If two would overlap, the gap grows; the hit area never shrinks.

**One label per card or row.** Each card or row is one accessibility element. Its label is composed in words, not read fragment by fragment: "Day 3, today. The Call to Consecration. 16-minute focus from 1 hour 21 minutes. 38 minutes left." Read times as words ("56 minutes 44 seconds"), not "56:44". Kickers' "·" separators become full stops in the label. Decorative artwork, walls, fans and the navy rule are hidden from accessibility.

**The scrubber** (sermon band, MiniScrubber, transcript follow):

- `accessibilityRole="adjustable"`, with the value as words ("34 minutes 12 seconds of 2 hours 37 minutes").
- Increment and decrement move by 30 seconds.
- Custom actions: "Next moment", "Previous moment", and on a path day "Go to today's focus".
- Moment ticks are not separate targets; they are reached through these actions and the Moments list.

**Gestures need a visible or spoken alternative.**

- Long-press on a moment (share or remove) and the native context menus are also in a visible "…" button and in `accessibilityActions`.
- Swipe-to-remove in History is also a "Remove" accessibility action plus an Edit mode.
- Swiping the mini player down to stop is also a Stop action.

**Announcements.** Toasts, "Saved", "Day 3 done" and search result counts ("12 moments in 7 messages") are announced with `AccessibilityInfo.announceForAccessibility`. The scrubber's per-second tick is never announced.

**Reduce Transparency and Increase Contrast.** The app uses no blur of its own. If the native tab bar (§4 TabBar) is adopted, the system handles Reduce Transparency. Under Increase Contrast, swap `c.muted` → `c.text` for captions and draw card hairlines in `#cfc6b6`.

### 3.10 Critic: dependencies and platform notes

Checked against `package.json` (Expo SDK 57, React Native 0.86.3, expo-router 57, Reanimated 4.5, react-native-webview 13.16) and `app.json`.

| Need | Status | Use |
|---|---|---|
| Fade-in and caching for artwork | `expo-image` (not installed) | ArtworkFrame: `transition={200}`, the `artworkTint` as background, memory and disk cache so walls don't refetch |
| Progress rings (mini player, PartOfPathRow "3/7") | `react-native-svg` (not installed) | Ring arcs. Bars, dashed borders and the scrubber don't need it. |
| Share-a-moment image | `react-native-view-shot` + `expo-sharing` (not installed) | Captures the offscreen ShareCard (§5 Share a moment) |
| Native context menus | expo-router `Link.Menu` / `Link.Preview` (installed) | Long-press on rows and cards on iOS; the Sheet action menu on Android |
| Native tabs with Liquid Glass, minimise-on-scroll, a bottom accessory | expo-router `NativeTabs`, including `NativeTabs.BottomAccessory` (installed) | Optional TabBar route (§4 TabBar) |
| Self-hosted audio, background play, lock screen | `expo-audio` or `react-native-track-player` (later) | Listen mode, "Continue as audio", lock-screen Now Playing with square artwork (§3.6 rule 11) |
| Screen-level orientation | react-native-screens `orientation` option (installed) | Landscape on the sermon page only (§5 Fullscreen and landscape) |
| Linear fades | `experimental_backgroundImage` through `gradient()` in `ui.tsx` (in use) | WallWindow fades. No new dependency. |

**Platform notes**

- **The web build is a real surface.** Team testers get the web link (approved). Sheets fall back to modals, haptics no-op and `NativeTabs` uses its web view. Fades and `boxShadow` work. Test every new screen on web as well as iOS.
- **Android.** Press feedback stays scale-only (no ripple), as specified. Use edge-to-edge with the gesture inset under the tab bar. The hardware back button closes sheets before popping screens. Formsheet detents come from react-native-screens on both platforms.
- **iPad** runs in iPhone compatibility mode (`supportsTablet: false`), so the "≥768pt floating video card" rule in §5 doesn't apply yet.

---

## 4. Components to build

Each of these replaces something generic in the app today.

**ArtworkFrame** (replaces `Thumbnail`)

- Props: `size` (one of the ladder names in §3.6), `sermon`, `progress?`, `showDuration?`.
- Follows §3.6 rules 1 to 6.
- The image is decorative; the row or card that holds it owns the accessibility label.

**WallWindow** (generalises `ArtworkCollage`)

- Props: `sermons`, `width`, `height`, `fadeTo`, `reduced`.
- Tile width is 0.42 × the container width; the gap is 0.045 × the tile width.
- Tiles are rotated -8°, alternate rows are offset by half a tile, and the plane is centred at 44% of the height.
- Artwork sits at 0.88 opacity over its `artworkWash`, on a `c.feature` ground.
- Sizes: Home masthead is the safe-area top + 188 by 390. Path and series covers are 390×300 behind the header.

**CardFan**

- Props: `sermons` (2 or 3), `width`, `height`.
- Geometry is as in §3.6 rule 7.
- Sizes: 150×110 inside the path today card, 300×150 on series cards, 56×44 in "part of a path" rows.

**TopicCard**

- 165×120, sand, radius 20.
- The topic name sits top-left in Newsreader 500 22/28, inset 16.
- One Peek tile (128 wide) sits bottom-right.
- See `concepts-snapshot/editorial/home-full.png`, "From your topics".

**Masthead** (Home only)

- A WallWindow band. The fade starts with an ivory wash at 0.9 under the status bar, is clear from 18% to 45%, and is solid ivory by 100%.
- On the fade, the wordmark row: the navy rule and "Arome Osayi" in Manrope 700 17. On the right, a 36pt navy avatar with the initial in Newsreader italic white, which opens Account. Guests get a "Sign in" text button instead.
- Below, a gold kicker with the date ("WEDNESDAY, 14 OCTOBER", from devotional), then `title` "Good morning, *Mufaro*".
- It scrolls away with the page and is never sticky.

**SectionHeader**

- Optional gold `kicker`, 4pt, then a `section` serif title, then an optional muted caption subtitle.
- A trailing "See all" (`label`, navy, 44pt hit area) or a muted count ("5 moments") aligned to the title's baseline.
- 40pt above, 12pt below.

**Rail**

- Horizontal, with 24pt insets, 12pt gaps, snapping, and 1.3 cards visible.
- At most 10 items, then a sand "See all 24" end card.
- Hide the rail if it has fewer than 2 items.

**SermonCard** (rails)

- `railL` artwork with the Art lift and a duration chip.
- 10pt below, `cardTitle` (2 lines), then a caption: "13 Oct 2026", or "Today · Dr Arome Osayi".
- No card background.

**SermonRow** (restyle of the existing one)

- `row` artwork, a 16pt gap, then a text column:
  - kicker: topics on browse screens; state on Library ("IN PROGRESS · 41 MIN IN", "SAVED 3 DAYS AGO");
  - `cardTitle`;
  - caption;
  - an optional TimePill.
- Keep the `useStackedRows` stacking for narrow screens and large text.
- In Library contexts, add a trailing 32pt sand circle with a navy ellipsis.

**ContinueCard**

- White, radius 16, 12pt padding, Level 1.
- `row` artwork with its progress bar, then the title (`cardTitle`), a caption with the event, and "1 hr 12 min left" in navy `labelSmall`.
- Tapping the card opens the sermon page and resumes. The time pill resumes in place.
- With 2 or more items it becomes a rail of 280pt cards. Immersive's two-up artwork tiles are fine on Library, but not on Home.

**PathTodayCard** (Home; adapted from all three concepts)

- Above the card on ivory: the kicker "YOUR PATH · DAY 3 OF 7" in gold, with "View path" on the right.
- The card is sand, radius 20, padding 20:
  - the path name in `section` serif with its italic phrase on the left, and a CardFan (150×110) on the right;
  - 16pt below, PathProgress;
  - 16pt below, an inner white card (radius 16, padding 16): today's sermon title in `cardTitle`, the caption "16-min focus from 1:21:14 · Today", and a 48pt navy play circle on the right.
- When the path is finished, it shows "Path complete · Choose your next path".

**TimePill**

- 28pt tall with a 44pt hit area, horizontal padding 10, pill radius.
- Sand ground (`featureOnSurface` on white).
- A 10pt navy play glyph, a 6pt gap, then `labelSmall` in navy.
- States:
  - "▶ 2 hr 28 min"
  - "▶ 1 hr 12 min left"
  - "▶ Play from 56:44"
  - a pause glyph with "Playing"
  - a check with "Watched" in muted
- Accessibility label: "Play from 56 minutes 44 seconds".

**MomentResult** (search; from devotional)

- A white card, radius 16, padding 16.
- Header row: `row` artwork with the timestamp chip on it, then the sermon title (`cardTitle`) and the caption "14 Aug 2026 · 2 hr 27 min".
- 12pt below, the quote in `quote` (upright Newsreader 19/28) behind a 3pt gold rule, 12pt from the rule.
- 12pt below, a text link "▶ Play from 56:44" in navy `label`.
- Quotes are at most 5 lines, with "Read more" if longer.

**BestMatchCard** (the first search result)

- White, radius 16.
- `stage` artwork with a "BEST MATCH" chip top-right (scrim, `meta` white) and the timestamp chip bottom-right.
- Then the title (`cardTitle`) and caption.
- Then a **MiniScrubber**: a 4pt `c.track` line spanning the sermon, with a navy dot at the moment, under the caption "Speaks to this at 1:32:04" in navy `labelSmall`, with 0:00 and the end time in muted at the ends.
- Then the quote with the gold rule.
- Then the one navy pill in the view, "▶ Play from 1:32:04", plus 44pt Save and Share circles.

**MomentRow** (sermon page, Moments sheet, path days; from devotional)

- A left column holding a timestamp chip: sand, `labelSmall` navy, padding 4×10, pill.
- Then the moment's title as a kicker ("LIVING ABOVE IT"; it comes from the data), then the quote in `quoteSmall`.
- Rows sit together in one white container, with dividers between them.
- The playing row: the chip turns navy with white text, the kicker reads "PLAYING" with a 3-bar glyph, the full-height navy rule shows on the left, and the background is `#f3f4f6`. (Navy at 4% over white is neutral, so a navy-cool tint reads as "you are here" here.)
- A muted group label "EARLIER IN THIS SERMON" separates moments that have already passed.

**WordForToday** (Home; from editorial and devotional)

- A sand card, radius 20, padding 28/24, centred.
- The kicker "A WORD FOR TODAY" in `mutedOnFeature`. Gold isn't allowed on sand.
- 12pt below, `quoteLarge` italic, 3 lines at most.
- 12pt below, a caption with the sermon title and timestamp.
- 16pt below, a navy pill "▶ Play this moment".
- An editor picks it each day from verified moments. Hide the card if there is none.
- *Critic: make it the one full-bleed band on Home.* Editorial's render (`concepts-snapshot/editorial/home-full.png`) runs the sand edge to edge, with no radius and 40pt of vertical padding. It is the only place below the masthead where the column breaks, and that change of rhythm does more against the "stack of cards" feel than any styling inside the cards. Use the band on Home; keep the radius-20 card where it sits inside other content (Day complete, Listen).
- *Critic: the daily pick is a recurring chore.* A solo owner won't pick a quote every morning. Store an editor-approved queue, `{ momentId, date? }`, filled a month ahead. Each day shows the dated entry, or else the next undated one by a stable rotation. If the queue is empty the card hides, as above.

**Chips**

- **NeedChip.** 40pt, sand, pill, Manrope 500 15/21 in `c.text`. Written in first person and sentence case, the way a person would say it: "I keep falling into the same sin", "Fear of the future", "Waiting on God". Tapping one runs that search. This adopts the concepts; it replaces the earlier serif-chip idea.
- **FilterChip.** 36pt. Unselected: sand with `label`. Selected: navy with white text and a leading 16pt check. Hide any chip whose count is 0.
- **TopicTag.** 32pt sand, with a 16pt navy icon and a label at 14/20.

**SegmentedControl**

- 36pt sand track, radius 18; the thumb is white with the Level 1 shadow; the label is 14/20.
- Show only the segments that exist (for example Watch / Listen / Read).

**PathCard** (Paths tab rails)

- 264 wide.
- A sand 264×176 box (radius 20) with a CardFan inside.
- 12pt below, the gold kicker "7 MESSAGES · ABOUT 20 MIN A DAY".
- 4pt below, the path name in `section` serif with its italic phrase.
- 4pt below, a one-line promise in a muted caption.

**PathProgress**

- One segment per day, up to 14. Each is 4pt tall with a 4pt gap and radius 2.
- Done segments are navy. Today's segment is navy at 45% width over a track (it shows partial progress through today). Upcoming segments are `c.track`.
- Captions: "Day 3 of 7" in navy `labelSmall` on the left; "2 done · 5 to go" in muted on the right.

**DayRow** (path detail; all three concepts)

- A 32pt timeline column. The marker is a 28pt circle:
  - done: navy with a white check;
  - today: a 2pt navy ring with a navy centre dot;
  - upcoming: a 1.5pt `c.track` ring with the day number in muted.
- A 2pt connector runs between markers: navy through today, `c.track` after.
- Content:
  - a kicker: "DAY 1 · WATCHED", "DAY 3 · TODAY", "DAY 4 · UP NEXT · 2 HR 38 MIN";
  - the sermon title in `cardTitle`;
  - the day's theme line in a muted caption ("Sin shall not have dominion");
  - `compact` artwork on the left.
- Today's row lifts onto a white card (radius 16, padding 12). It holds the 16:9 art, the title, "16-min focus from 1:21:14", a progress line, and the line "Key moment 53:44 · victory over sin" (from immersive).
- Days after today are readable and playable. Mark them "UP NEXT" or "AFTER TODAY", **never with a padlock**. Tapping one asks "Start with Day 3 first?" with Open anyway / Go to Day 3.

**LibraryTile**

- 165×96, sand, radius 20.
- A 32pt white well top-left with an 18pt navy icon; the label bottom-left.
- The count is top-right in `mutedOnFeature`, hidden at 0.

*Critic: replace the icon wells with your own artwork.* A 2×2 grid of icons in wells is the generic "quick tiles" pattern (Hallow, Sofa), and §6 already bans its twin on Home. Build LibraryTile the way TopicCard is built, so Library is made of the person's own sermons:

- 165×120 minimum, sand, radius 20, padding 16.
- The label top-left in Manrope 600 16, with the count beneath in `mutedOnFeature` caption ("12 sermons", "6 moments", hidden at 0).
- Bottom-right, a Peek of the latest item (Saved, In progress, History) or a 2-tile CardFan when there are 2 or more.
- Moments are a quote, not a picture: show the first line of the latest saved quote in `quoteSmall`, 2 lines, clipped by the card. If the moment has no verified quote, show "at 34:12" in navy `labelSmall`.
- Empty: the dashed ghost (§5 Library) with the 18pt navy icon, so the icon set appears only when there is nothing of yours to show.

**PartOfPathRow** (sermon page and player; devotional and editorial)

- A sand bar, radius 16, padding 12.
- On the left, a 40pt progress ring ("3/7" inside in navy `labelSmall`) or a mini CardFan.
- Then the kicker "PART OF YOUR PATH · DAY 3" in `mutedOnFeature`, the path name in Manrope 600 15, and a chevron.

**Buttons**

- **Primary.** Navy pill, 52pt, white `label`, at most one per section.
- **Two-line play.** Navy pill, 56pt. Line 1 is "Watch", "Resume" or "Continue Day 3" in Manrope 700 16. Line 2, or a "·" suffix, is "2 hr 37 min" or "38 min left" at white 80%.
- **Sticky CTA** (path and series pages; all three concepts). A two-line or single-line navy pill, 56pt, Level 2, floating 16pt above the home indicator with 24pt side insets. Content scrolls under it; pad the bottom of the scroll by the CTA height + 24.
- **Pill pair.** 44pt pills with an icon and a label: "Save" or "Saved" (navy filled once saved, from devotional), and "Share" (white with a hairline). A 44pt "…" circle sits at the far right.
- **Tonal.** A 44pt sand pill with a navy label.
- **Icon.** A 44pt circle, white with a hairline, with a 22pt icon.
- **Text.** A navy `label` with a 44pt hit area.
- **Destructive.** `c.error` text; it is filled only inside its confirm sheet.

**Sheet**

- White, top radius 24, a 36×5 grabber, a centred `heading`.
- Detents at medium and large.
- Action menu rows are 52pt, with a 20pt muted icon and a 16pt label. Groups are separated by an 8pt sand gap, with destructive actions last. Use the native context menu on long-press.

**MiniPlayer** (audio pill)

- 56pt, radius 28, Level 2, 16pt in from the sides and 8pt above the tab bar.
- From left to right:
  - `mini` artwork;
  - the title (`label`, 1 line), with "1 hr 12 min left" or the current moment's title in a caption below;
  - a 40pt navy play/pause inside a 2pt progress ring (navy on `c.track`).
- Tapping expands it. Swiping down shows "Stopped · Undo".
- The video state reads "Paused at 34:12", with Resume.
- *Critic:* if the native tab bar is adopted (below), the MiniPlayer lives in `NativeTabs.BottomAccessory`, the slot Apple Music and Podcasts use. Its content is the same: artwork, title, time left, play/pause. Read `NativeTabs.BottomAccessory.usePlacement()`. When the bar minimises on scroll (`"inline"`), drop the caption line and the ring and keep artwork, title and play/pause. The 56pt floating pill remains the Android and web version.

**TabBar**

- Keep the floating pill.
- Active: a filled navy icon and navy label on a sand capsule. Inactive: muted outline icons.
- Hidden on Now Playing, in onboarding and under sheets.

*Critic: consider the native tab bar on iOS (needs the owner's OK).* The floating white pill is a hand-built copy of iOS 26's glass tab bar. Next to system apps it reads as a copy, and it has to re-solve Dynamic Type, the large content viewer and hit areas by hand. expo-router's `NativeTabs` (installed) gives the real thing:
- Liquid Glass with the navy tint;
- minimise-on-scroll (`minimizeBehavior="onScrollDown"`);
- a bottom-accessory slot for the mini player;
- system accessibility.

What it costs: the sand capsule behind the active tab (the system draws its own selection), and pixel control. Android gets Material's bottom navigation, and web keeps a JS bar. Recommendation: build a one-screen spike and compare it on the phone with the welcome. If the owner prefers the pill, keep it and give it the accessibility behaviour of §3.9.

**Header**

- 56pt, with a 24pt chevron in a 44pt hit area.
- Over covers and the stage, use 40pt round buttons: white at 92% with Level 2 over ivory or light artwork, and `rgba(15,17,21,0.55)` with a white glyph over the dark stage.
- The page title crossfades into the header only after the serif title has scrolled under it (150ms).
- *Critic: nothing of ours may sit on the YouTube frame.* Round buttons over the stage are fine over AAO's artwork before play, but once the embed mounts they would cover YouTube's own top-left and top-right controls. That breaks the project's rule that provider controls stay unobscured (`docs/project-context.md`). On the sermon page, the chevron and "…" live in a 44pt `c.media` bar under the status bar, **above** the stage, not over it (§5 Sermon page). Round buttons over imagery are only for walls and covers.

**Toast**

- Level 2, radius 16, at least 48pt tall, padding 12×16.
- The action is navy `label`. The toast sits 8pt above the dock or tab bar, one at a time, and is announced to screen readers.

**StatePanel** (empty, error, offline)

- Centred at about 40% of the free height.
- A 56pt sand circle with a 24pt navy icon.
- 16pt below, a serif `stateTitle`.
- 8pt below, muted `body`, up to 300pt wide and 2 lines.
- 20pt below, **one** tonal call to action. Errors use a primary "Try again" instead, and the icon stays navy, not red.

**Placeholder**

- Static sand blocks at the exact final geometry. No shimmer.
- Content fades in over 200ms. After 8 seconds, show the error state.

**OfflineBanner**

- 40pt, sand, under the header, with a 16pt cloud-offline icon and the copy "You're offline. Reconnect to watch." (or "Downloaded sermons still play." once downloads exist).
- When the connection returns, show a "Back online" toast.

**SearchField**

- 56pt, white, pill, with a 1.5pt navy border while focused and a hairline `#878279` otherwise.
- A leading 20pt muted search glyph (no sparkle).
- The placeholder is Newsreader *Italic* 18: "What are you going through?". Typed text is Manrope 17.
- A 28pt sand clear button.
- A helper line inside the field under the text while searching (devotional): "Searching every message by meaning", in muted caption.
- *Critic:* draw the serif-italic placeholder as an overlay, not the input's own placeholder; see §3.1 "The placeholder font". The placeholder's colour is `c.muted` (6.24:1 on white), because it carries the question.
- *Critic: the prompt must match what search can do.* "What are you going through?" and "Searching every message by meaning" promise need-based answers. Show them only once meaning search over verified moments is live. Until then the placeholder is "Search messages" and there is no helper line (§5 Launch state).

**ShareCard** *(Critic: new; see §5 Share a moment)*

- Exported as a 1080×1350 (4:5) image from an offscreen view. The same view at 0.3 scale is the preview in the share sheet.
- Ivory ground, with 72px margins at export size.
- The sermon's 16:9 artwork across the content width at the top, with radius 24 and the Art lift. It is never cropped and never has text on it.
- 56px below the artwork: the quote in Newsreader 500, upright, 52/68 at export, at most 6 lines, with a hanging opening quote mark and the 6px gold rule on its left. A quote that needs more than 6 lines is shared as a link only.
- 32px below: "Apostle Arome Osayi" in Manrope 700, then the short headline and "at 34:12" in Manrope 400, muted.
- The footer, bottom-left: the navy rule and the "Arome Osayi" wordmark, as on the welcome. No QR code, no URL text and no app-store badge; the link travels with the share.
- Only verified quotes. A moment without one can still be shared, as a link only.
---

## 5. Screens

### Navigation (needs the owner's OK)

**Tabs: Home · Paths · Search · Library.** Account moves to the avatar in the Home masthead and the Library header.

The three concepts all use Home · Paths · Search · Account. This keeps their order but swaps Account for **Library**. Saved sermons, moments, Continue and History need a home that reads as content. Today they are buried in Account, where they read as settings (`../shots/19-account-member.png`). Account is visited rarely and the avatar covers it; devotional already puts one there.

Topics stops being a tab. It becomes the "From your topics" cards on Home and "Browse by topic" in Search. Until paths have content, ship three tabs: Home · Search · Library.

*Critic:* removing the tab still leaves a topic **page** for those cards to open, plus "See all" pages for the rails. Neither was specified; both are now below (§5 Topic page, §5 "See all" lists). Whether the tab bar is the hand-made pill or the native iOS bar is a separate owner decision (§4 TabBar).

### Critic: Launch state (the catalogue as it is today)

**Why this section exists.** `src/data/sermons.ts` holds 4 verified sermons: *Pray Without Ceasing* (Lioness Conference, 27 Sep) and *Apostolic Shift* Day One, Day Two Morning and Grand Finale (22–23 Sep). There are no transcripts, verified moments or paths, and the 4 topic assignments in `edification.ts` are marked `reviewStatus: "demo"`. Under §2's honesty rules, the need chips, quotes, A word for today, Paths and "New this week" (nothing is from the last 7 days) all hide. If the builder ships the system as written, the launch Home is a masthead, a search box and a gap. This is the composition for that catalogue. It is designed to grow into the full Home without a redesign.

**Home at launch**

1. **Masthead**, as specified: a wall of the 4 posters following §3.6 rule 12, the date kicker, and "Good afternoon, *Name*".
2. **Search field**, with the serif-italic placeholder "Search messages" and no need chips (§4 SearchField). It opens Search.
3. **Continue watching**, once progress persists (§5 Library "Data"). This is the reason progress persistence moves to the front of the build order.
4. **The latest message.** One threshold-scale feature with no white card around it. A `stage` (342×192) with the Art lift, sitting on ivory. Then the gold kicker "LATEST · 27 SEP", the title in `cardTitle` at 20/26 (the one place it runs larger than 17), the event caption "Lioness Conference · Grand Finale", and the two-line play button "▶ Watch · 3 hr 35 min". This is today's Featured card minus the box. The masthead wall above it carries the "fabulous".
5. **The conference programme**, the best story the real catalogue has. The Apostolic Shift posters say DAY ONE and DAY TWO themselves.
   - The `section` heading "Apostolic Shift", with the italic phrase only if the editor sets one.
   - The caption "The Votage · 3 sessions · 22–23 Sep 2026".
   - Then the sessions in order as SermonRows with kickers ("DAY ONE", "DAY TWO · MORNING", "GRAND FINALE"), the one in progress marked with the navy rule.
   - The link "View conference" opens the Series page.
   - When there are 2 or more series with 2 or more sessions each, this becomes the Series rail.
6. **Topics**, only if the owner reviews the 4 assignments (an open question). Otherwise topics stay off Home, and so does the "sample labels" disclaimer.

**Search at launch.**
- The page title is `title` "Search" and the field reads "Search messages".
- The default state shows Recent searches and "Browse by conference" (the 2 series as sand cards with fans).
- Typing matches titles, events and dates.
- Results are SermonRows. No-results is the StatePanel without need chips.
- When verified moments exist, switch the whole tab to the §5 Search spec. It's one flag, not a redesign.

**Sermon page at launch.**
- No ticks, no moment pill and no Moments section. The band's centre caption is empty (never the speed).
- "More from Apostolic Shift" sits directly under the actions as the session list in order.
- **Save this moment ships anyway.** It doesn't need a transcript: it saves a timestamp. The toast reads "Saved at 34:12 · View". In Library, it shows as a MomentRow with the time chip, the sermon title in place of the quote, and the person's own note if they added one.

**Library at launch.** Continue, Saved, Moments (timestamps) and History as LibraryTiles. A tile with nothing in it is the ghost.

**Tabs at launch.** Home · Search · Library.

**What not to fake at launch:** need chips, quotes, "by meaning", Paths, A word for today, counts, and "New" labels on sermons older than 7 days.

### Home

**Job:** greet the person, get them to what they are going through or where they left off, and offer one thing worth hearing today.

**Today** (`../shots/06-home-member.png`): a sans-serif title, a search box, featured artwork in a white card, and a "For you" list. It is correct, but it looks like a template.

**Layout** (editorial's order, with devotional's details):

1. **Masthead.** The wall band, the wordmark plus avatar, the date kicker, and "Good morning, *Mufaro*".
2. **Ask.** The SearchField with its serif placeholder, then 12pt below, one horizontal row of NeedChips. Tapping the field opens Search, focused. Greeting followed by question reads as one conversation.
3. **Your path.** The PathTodayCard, shown when enrolled. If the person isn't enrolled and 2 or more paths exist, show a "Start a path" rail of PathCards instead.
4. **Continue watching.** A `section` header, then the ContinueCard, or a rail of them. Remove any item already shown as today's path sermon, so nothing appears twice.
5. **New this week.** A `section` header with "See all", then a rail of SermonCards. This replaces today's single Featured card. The editor's pick, if any, goes first.
6. **A word for today.** The WordForToday card.
7. **Series.** A rail of series cards: a 300×150 sand box with a CardFan, then the name in Manrope 600 17 and "The Votage · 3 sessions". Editorial's fan, not devotional's square crops.
8. **From your topics.** The gold kicker "FROM YOUR TOPICS · PRAYER, HOLINESS", then a 2×2 grid of TopicCards and an "All topics" link.

Sections with fewer than 2 items don't render, except Continue. Sections are 40pt apart.

**Critic: a Home budget.** Eight stacked sections is the devotional-app template (Hallow, Abide, Glorify). It is a page you scroll past, not one you finish. Rules:
- At most **6 blocks under the masthead** for any one person.
- When more qualify, drop in this order: Series (it lives in Search's default state too), then From your topics (it lives in Search), then New this week.
- Ask, Your path and Continue are never dropped.
- A word for today is the one full-bleed band (§4 WordForToday). Place it after the second rail, so the column breaks once, in the middle.

**Critic: headings in the voice.** Section headings are serif (§3.1), so write them the way the ministry would say them, not as Netflix nouns. Keep them short enough to scan, and with no italic (one italic per screen, and the greeting has it).

| Instead of | Write |
|---|---|
| Continue watching | Pick up where you left off |
| New this week | Preached this week (only within 7 days; otherwise "Latest messages") |
| Series | Conferences and series |
| From your topics (kicker) | Keep as a gold kicker over the cards; it is a label, not a voice line |

The owner should approve this copy. If he prefers plain labels, keep them in Manrope 700 17 (as Search does), not in the serif.

**States**

- **Guest.** The greeting has no name. Your path and Continue are hidden, and New this week follows Ask.
- **Loading.** The masthead tiles show their washes; placeholders for the path card and a rail.
- **Offline.** The banner shows and cached content stays.
- **Dock.** See Now Playing. Never again lose about 45% of Home to a docked video (`../shots/17-docked-player-home.png`).

**Our concepts**

- `concepts-snapshot/editorial/home-full.png`: the masthead and the order to follow.
- `concepts-snapshot/devotional/home-full.png`: the date kicker, the "16-min focus" line, and the word-for-today card.
- `concepts-snapshot/immersive/home.png`: not adopted. Its dark Home hero sets a serif title over a cropped preacher photo and uses a pager (§7).

**References**

- `home/abide-01-home.png`: a serif "Good Morning", with need chips ("Play meditations for… Anxiety") on Home. Take the greeting followed by chips. Leave the Premium pill and the yellow wash.
- `home/dwell-01-home.png`: ivory, an "Up Next" rail with ▶10m pills, a sand "Nothing in progress" placeholder. Take the time pills and the calm placeholder. Leave the promo banner.
- `home/biblewatch-01-home.png`: "Verse of the day" in serif with gold small caps. Take the quote as the day's image. Leave the levels and flames.
- `home/masterclass-02-home-rails.png`: 16:9 rail cards with metadata below the art and a duration on it. Take the metadata placement. Leave the black page.

### Search

**Job:** turn "what I'm going through" into the exact minutes where the Apostle speaks to it.

**Default (empty field)**

1. The `question` "What are you *going through*?" with no other page title.
   - *Critic: set it at `hero` size (38/42) with 40pt above it.* This is the most welcome-like screen inside the app: one serif question with one italic phrase, and one field. Give it the welcome's scale, so Search has a typographic threshold instead of none. Once the field is focused, the question fades out and the field rises to the top (200ms `easeOut`; Reduce Motion: instant), so typing and results get the room. It comes back when the field is cleared and dismissed.
2. The SearchField, 20pt below.
3. **Common needs.** NeedChips in a wrapping cloud, 10 to 14 chosen by an editor. Show a need only if it has 2 or more verified moments.
4. **Recent searches**, if any. Up to 5 rows of 48pt, each with a clock icon, the query, and a trailing ×. "Clear" sits beside the section title.
5. **Browse by topic.** The 2×2 TopicCards. This replaces the Topics tab.

**Typing** (150ms debounce; the list swaps with a 120ms fade)

1. `Search for "fea"`
2. Need and topic matches with counts: "Fear · 6 moments", "Fear of man · 2 moments".
3. Sermon titles, with `mini` artwork and the matched text in 700.
4. Scripture references.

Show at most 8 rows.

**Results** (devotional's structure)

1. **What we understood.** The chips under the field change to related needs ("Shame after I fall", "Resisting temptation"). Above the results, a muted line with the understood themes in Manrope 700: "Moments about **temptation**, **the flesh** and **grace**" (from editorial). This is how meaning-based search earns trust.
2. A row with the header "Moments that speak to this" in Manrope 700 17, and a muted count on the right ("12 moments in 7 messages").
3. **BestMatchCard.**
4. **A path for this**, if a path matches. A **sand** card (not navy) with a mini CardFan, the kicker "A PATH FOR THIS" in `mutedOnFeature`, the path name in serif, and "Day 3 of 7 ›" or "7 messages".
5. **MomentResult** cards. Show 10, then "Show more moments".
6. **Sermons.** A header "Sermons · 9", then SermonRows.
7. The topic disclaimer, if still needed, as one quiet line at the very bottom.

**No results.** A StatePanel:

- Title: `Nothing for "xyz" yet`.
- Body: "Try a simpler word, or one of these:", followed by 4 NeedChips.
- A text button, "Tell us what you were looking for". It opens a short feedback sheet, and nothing is sent until the person taps Send.

**Our concepts**

- `concepts-snapshot/devotional/search-full.png`: the main model. Best match with a mini scrubber, upright serif quotes with a gold rule, "Play from" links.
- `concepts-snapshot/editorial/search.png`: the "what we understood" line and the kicker "12 MOMENTS IN 7 MESSAGES".

**References**

- `search/insighttimer-need-chips.png`: needs phrased the way people say them, in a wrapping layout.
- `search/biblechat-need-chips-browse.png`: need chips over serif section headings on a warm page.
- `search/skillshare-typing-suggestions.png`: `Search for "Dev"` first, then suggestions with counts. Take the order of the typing state.
- `search/snipd-insight-play-from.png`: a quote with a "From 01:24" play control. Take the quote as a result you can play. Leave the dark theme.
- `search/instaread-cant-find-recovery.png`: "Can't find what you're looking for?" as recovery. Take one honest way forward.

### Paths tab and path detail

A **path** is a ministry-ordered series of days. Each day is a sermon with a **focus segment** (start and end time, for example 1:21:14 to 1:37:02), a theme line, a key moment and a verified quote.

**Paths tab**

1. `title` "Paths", with the lead "Short guided journeys through the Apostle's teaching, a day at a time."
2. **Your path** (if enrolled): the PathTodayCard.
3. **For what you're facing:** a kicker "BY NEED", then a rail of PathCards.
4. **Start here:** a kicker "FOR NEW BELIEVERS", then PathCards.
5. **Finished** (collapsed): rows with a "FINISHED 12 SEP" kicker.

**Path detail** (all three concepts agree)

1. **Cover.** A 390×300 WallWindow of the path's own sermons, fading to ivory, with round back and share buttons. (Immersive's dark cover with a fan is out.)
2. On the fade: the gold kicker "GUIDED PATH · 7 MESSAGES", then the name in `title` with its italic phrase ("Breaking free from *habitual sin*"), then a `lead` with one sentence on who it's for.
3. **The trust line**, in a muted caption: a 16pt shield-checkmark icon, "Order chosen by the ministry · About 20 min a day".
4. **Why this path.** A sand card, radius 20. The kicker "WHY THIS PATH" in `mutedOnFeature`, then 2 or 3 sentences in Newsreader 18/27. This is the screen's one block of serif prose (from devotional).
5. **Progress** (once started): PathProgress.
6. **Days:** DayRows on the timeline, with today's row lifted.
7. **Sticky CTA:** "▶ Continue Day 3 · 16 min", or "▶ Start Day 1 · 18 min".

**Playing a day**

- The player opens at the focus start.
- The scrubber marks the focus segment in gold (§ Now Playing).
- At the focus end, the stage shows "That's today's teaching", with "Keep listening" or "Finish Day 3".

**Day complete** (sheet, medium detent)

- `title` "Day 3 *done*."
- The day's quote, in the WordForToday style, with "Save this moment".
- "Tomorrow: Day 4 · The Cost of Discipleship · 22 min".
- A primary "Done for today", and a text button "Keep listening from 1:37:02".
- No flame, streak or confetti. A light haptic.

**Reminders.** Ask only after the person taps "Remind me", in the path's ⋯ menu. First show a serif primer, "Want a gentle reminder for Day 4?", with a time (7:00 am) and "Not now". Never ask at launch or in onboarding.

**Our concepts**

- `concepts-snapshot/editorial/path.png`: the wall cover, the timeline, the sticky CTA.
- `concepts-snapshot/devotional/path-full.png`: the trust line, "Why this path", and "16-min focus".

**References**

- `browse/dwell-psalms-plan.png`: the plan header with "▶ Day 1", bell and share, then day rows with durations. Leave the purple gradient.
- `paths/abide-03-journey-detail.png`: a serif title and a dashed day timeline. Leave the circle crops and the "PREMIUM" lock.
- `browse/scroll-plans-browse.png`: a kicker over a serif heading and a muted lead, and "21 days · about 5 min/day". Take this header recipe and the honest length line.
- `browse/scroll-active-plan.png`: "This is your active plan", and facts listed as "Best for / Length / Daily commitment".
- `details/scrollbible-day-complete.png`: the completion layout with a quote card. Leave the streak.

### Sermon page (one screen that becomes Now Playing)

**Today** (`../shots/11-sermon-guest.png`, `../shots/16-sermon-playing.png`): an inset artwork with a pill over it, outlined Save and Share, the raw uppercase YouTube title and a cookie note on the main view, and "1×" sitting between the two times.

**Layout** (devotional, with editorial's detail)

1. **Stage.** A `stageFull` 390×219 on `c.media`, flush under the status bar, with a round chevron-down or back button and "…".
   - Before play: the artwork with a 64pt play disc.
   - Playing: the YouTube embed, unobscured.
   - **The scrubber band below it, also on `c.media`, about 48pt:**
     - a 4pt track at white 25% with a white fill and a 14pt white thumb;
     - moment ticks: 2×10pt marks in white at 60%, 3pt above the track;
     - the path focus segment drawn in gold `#b8954a` with 2pt end brackets. This brighter gold is used only on dark and is never text.
     - The times row: elapsed on the left, "-48:03" remaining on the right (tabular, white 74%). The centre holds context in white `labelSmall`: "Day 3 focus · 1:21–1:37" or "4 moments marked". **Never the speed.**
   - *Critic: move the buttons off the stage.* The chevron and "…" sit in a 44pt `c.media` bar between the status bar and the stage, not on the stage. Before play they could float over AAO's own artwork, but the moment the YouTube embed mounts they would cover its controls (§4 Header). So the order down the screen is: status bar (light content) · 44pt dark bar · 390×219 stage · scrubber band · ivory panel. The dark block grows by 44pt and reads as one deliberate black "screen" at the top, like a cinema.
   - *Critic: two scrubbers while playing.* The embed keeps `controls: 1` (provider controls stay visible, per the project decision), so YouTube's own progress bar appears inside the frame whenever its controls show. Ours, in the band, is the app's scrubber: it carries the moments and the focus segment, it seeks with `seekTo`, and it follows YouTube's position through the existing 1-second state poll. Don't try to hide YouTube's bar.
2. **Ivory panel.** It rises over the band with top radius 24. Everything below sits on it.
   - *Critic:* "rises over the band" means the panel's rounded top overlaps only the bottom 24pt of the band, below the times row. It never reaches the video frame.
3. **PartOfPathRow**, if the sermon is in your path. Otherwise a "Part of *Apostolic Shift*" series row in the same style.
4. **Title** in `sermonTitle` serif (30/36). Below it, the caption "Dr Arome Osayi · 10 Sep 2026 · 2 hr 37 min".
   - *Critic: one name for the preacher.* The concepts write "Dr Arome Osayi", but the verified channel (`sermons.ts`) and the welcome say "Apostle Arome Osayi". Use "Apostle Arome Osayi" everywhere, unless the owner says otherwise. It is part of the open questions.
   - *Critic:* the title on this page is the short `headline()` from `display.ts` (for example "Apostolic Shift: Grand Finale"), never the uppercase YouTube title. The exact verified title stays in About this sermon.
5. **Actions.**
   - Not playing yet: the two-line play button, full width ("▶ Watch · 2 hr 37 min" or "▶ Resume · 1 hr 16 min left").
   - Then the pill pair, Save / Saved and Share, with "…" at the far right (Open in YouTube, Report a problem).
   - Playing: the play button gives way to the **transport** (see Now Playing below).
6. **Moments in this sermon.** A `section` header with "5 moments". MomentRows in one white container, with the playing row marked. Below the current moment, a "COMING UP IN 4 MIN" row (from immersive). Tapping a row seeks, with a selection haptic.
7. **Up next in your path.** A dashed-border card: kicker "UP NEXT IN YOUR PATH · DAY 4", with `mini` artwork and the title. Otherwise "More from The Votage", a rail.
8. **Topics:** TopicTags.
9. **About this sermon** (collapsed): the exact YouTube title, "Open in YouTube", and the cookie note.

**Guests.** Watch and Save open the existing join sheet, then resume what was tapped.

*Critic:* "More from The Votage" (step 7) should read "More from Apostolic Shift". The Votage is the venue and channel line; the series is what orders the sessions.

**Critic: opening a shared link at a time.** A shared moment or sermon link (`/s/<sermonId>?t=2052`) opens this page directly.
- The band's thumb sits at the shared time, and a quiet kicker above the title reads "SHARED WITH YOU · AT 34:12".
- The play button reads "▶ Play from 34:12".
- If the time matches a moment, that MomentRow is marked, and pressing play runs "Find the minute" (§3.8).
- Guests can play shared links without signing in (the approved exception), so the join sheet doesn't appear here, but Save still asks.
- An unknown or removed sermon shows the StatePanel "This message isn't available", with "Go to Home".

**Critic: fullscreen and landscape.** The app is locked to portrait (`app.json` `"orientation": "portrait"`), so a 2½-hour sermon can't be watched sideways. That is the first thing most viewers will try.
- Set the app's orientation to `default`, lock every screen to portrait through the stack's `screenOptions` (react-native-screens `orientation`), and allow `all` on the sermon page only.
- In landscape, the stage fills the window height on `c.media`, pillarboxed. The panel, the dark bar, the band and the status bar hide, and YouTube's own controls do the scrubbing. Nothing of ours is drawn over the video. Moments come back with the page when the phone turns upright.
- Rotating back restores the page at the same scroll position.
- Verify on a real iPhone and Android device, including YouTube's own fullscreen button, before calling it done.

**Our concepts**

- `concepts-snapshot/devotional/sermon-full.png`: the stage, scrubber band, panel, part of path and moments.
- `concepts-snapshot/editorial/sermon.png`: the moment dots and "4 moments marked".

**References**

- `_candidates-player/pocketcasts-episode-details.png`: date and length, one dominant play control, quiet actions.
- `_candidates-player/youtube-key-moments.png` and `player/youtube-chapters.png`: moments listed with tinted timestamp chips.
- `player/youtube-watch-chapter-pill.png`: the video pinned, the title and actions below it, and chapters shown on the progress line.

### Now Playing, the mini player and audio mode

**The dock decision.** On phones, stop docking a 200pt YouTube card over the page. When someone leaves the sermon page while video is playing:

- **If self-hosted audio exists,** continue at the same second as audio in the MiniPlayer, with the toast "Continuing as audio · Watch".
- **If it doesn't,** pause and show the MiniPlayer as "Paused at 34:12", with Resume (which reopens the sermon page and plays).

Never shrink the YouTube frame below 200×200, cover it with controls, or play its audio while it's hidden. Keep the floating video card only at widths of 768pt and up.

**Transport** (on the ivory panel when playing, under the title)

- A row 72pt tall, evenly spaced, with five items:
  - speed "1×", a 44pt text button in Manrope 700 15 navy;
  - back 15 (32pt glyph);
  - play/pause, a 72pt navy circle with a 30pt white glyph;
  - forward 30;
  - Up next (24pt, with a count badge), or Sleep if there's no queue.
- Below it, an action row:
  - a 48pt white pill with a hairline, with a bookmark-plus icon and "Save this moment";
  - 44pt muted circles for Sleep, Share and "…".
- **Save this moment** stores roughly t-20s to t+10s and the matching verified quote. It fires a light haptic and shows the toast `Saved "It is finished…" at 34:12 · View`.
  - *Critic:* with no verified quote at t (every case at launch), it saves the timestamp alone and the toast reads "Saved at 34:12 · View". Offer an optional one-line note in the saved moment's sheet. The person's own words are theirs to write; the app never fills in the Apostle's.
- **The moment pill** sits between the title and the transport: 32pt, sand, radius 16. An inner fill of navy at 10% grows through the moment. The label is Manrope 600 13, for example "When you feel rejected · 12:40 ›". When playback started from search, it reads "From your search: *rejection*" for the first 6 seconds. Tapping it opens the Moments sheet, flush under the stage, so the video keeps playing.

**Listen mode** (once self-hosted audio exists)

- A SegmentedControl, Watch / Listen / Read, sits in the panel header. It shows only the modes that exist.
- **The Listen stage** is the artwork at `stage` size on ivory. Below it, the current moment's quote is centred in `quoteLarge` under a gold kicker "AT 34:12". The quote crossfades over 240ms.
- **Read** shows the transcript in Newsreader 20/30, with a timestamp chip on each paragraph. The current paragraph is `c.text` and the rest are muted, never faded with opacity. The view auto-follows; scrolling by hand shows a navy "Back to now" pill.
- After scrolling past the transport, a 56pt sticky bar appears with `mini` artwork, the title and play/pause.

**Sheets**

- **Playback.**
  - Speed: chips at 0.75, 1, 1.25, 1.5, 1.75 and 2, remembered per user.
  - Sleep: 15, 30 or 45 minutes, 1 hour, "End of this moment", "End of today's focus", "End of this sermon". While a timer runs, the moon icon turns navy with a "28m" caption.
- **Up next.**
  - A context line: "From *Breaking free* · Day 3 of 7".
  - Rows with `compact` artwork, a "DAY 4" kicker and a TimePill.
  - "Play next automatically": on by default for paths, off for single sermons.

**States**

- Loading: the play button shows a spinner.
- Buffering: the ring pulses.
- Error: the message appears in the stage, with "Try again" and "Open in YouTube".
- Ended: on a path, show Day complete. Otherwise "Play again" and Up next.
- No moments: hide the ticks, the pill and the section entirely.

**Critic: lock screen, Control Center and interruptions** (once audio exists; this was missing)

- Now Playing info:
  - title: the short headline;
  - artist: "Apostle Arome Osayi";
  - album: the series name;
  - artwork: the square described in §3.6 rule 11;
  - elapsed and duration, kept in sync with seeks.
- Remote commands match the transport: play/pause, skip back 15 and forward 30 (`preferredIntervals`), and scrubbing. No next or previous track (§6). On a path day, "next" isn't offered either.
- A phone call or Siri pauses playback. It resumes only if it was playing and the interruption says it should, and it never starts from silence on its own.
- Unplugging headphones pauses.
- YouTube video never reaches the lock screen. Only self-hosted audio does.

**References**

- `player/ascension-light-player.png`: a light page with a 64pt navy play button and serif titles. It proves a light player looks premium.
- `player/snipd-nowplaying-transcript.png`: a chapter pill that fills, a five-slot transport, and "Create snip". Take the structure. Leave the dark purple and the AI and DJ buttons.
- `player/dwell-listen-readalong.png` and `player/dwell-upnext-minibar.png`: Listen/Read modes, plan context, and a 48pt mini pill with a progress ring, all in an ivory palette.
- `player/youtube-transcript.png`: sheets that open under the pinned video.
- `player/dwell-options-sheet.png` and `player/pocketcasts-sleeptimer.png`: one quiet Playback sheet with values shown under their labels.

### Library, Saved and History

**Library tab**

1. `title` "Library", with a 36pt avatar on the right that opens Account.
   - *Critic: "your wall" as the threshold.* Library is the only main screen without a threshold, and it's where the person's own choices live. When they have saved or watched 3 or more distinct sermons, put a short WallWindow (390×200, the same device as the Home masthead) behind the title, built only from **their** sermons. The welcome wall is the ministry's; this one is theirs. Below 3, show no wall and just the title, never a placeholder wall.
2. **Continue:** a ContinueCard, or a rail of them.
3. **2×2 LibraryTiles:** Saved, Moments, In progress, History. Downloads comes later. (*Critic:* use the artwork-led tiles in §4 LibraryTile, not icon wells.)
4. **Recently saved:** a SectionHeader, 3 SermonRows with state kickers, then the invite row "Find more on *Prayer*" (a 48pt sand tile with a navy +).
5. **Your paths:** the active path and finished paths as compact rows ("DAY 3 OF 7").

**Saved**

- `title` "Saved", with the meta line "12 sermons · 26 hr".
- FilterChips (All, Not started, In progress, Finished), shown only once there are 6 or more items.
- "Sort by **Recently saved** ⌄", which opens a sheet with Recently saved, Newest preached and Shortest first.
- SermonRows with TimePills.

**Moments.** MomentRows grouped by sermon. Long-press to share as text or image, or to remove.

**History.** Grouped under Today, This week and Earlier, with progress on the artwork. Swipe left to remove, with an Undo toast. "Clear history" sits at the bottom, behind a confirm.

**Empty states** (StatePanel)

| Screen | Title | Body | Action |
|---|---|---|---|
| In progress | "Nothing in progress" | "Start a sermon and we'll keep your place, to the minute." | "Find a sermon" |
| Saved | "Keep what speaks to you" | "Tap Save on any sermon and it will wait for you here." | "What are you going through?" (*Critic:* "Find a sermon" until need search is live) |
| Moments | "Save a moment" | "When a line stays with you, save it with its time so you can return to it." | none |
| History | "Your watching will appear here." | none | none |

On the hub, an empty section keeps its shape: a dashed ghost card, 165×93, with a 1pt `#c9bfae` dashed border, radius 12, and a muted icon.

**Data.** Persist progress as `{ sermonId, seconds, duration, updatedAt }` every 15 seconds and on pause. Store it on the account for members and locally for guests. Progress is only held in a ref today.

**References**

- `library/sofa-player-library.png`: status tiles on a cream page. Rebuild them on sand.
- `library/dwell-up-next-queue.png`: state kickers and sand "▶ 10m" pills.
- `library/blinkist-my-library.png` and `library/blinkist-saved-library.png`: In progress first, a navy selected chip, and "Sort by Recently saved ⌄". Leave "Unlock".
- `library/ascension-recent-history.png`: history grouped by "This week" and "Older".
- `library/hallow-me-favorites-downloads.png`: ghost cards that hold the layout before there's content.

### Series page

A series is an event or conference ("Apostolic Shift", "Lioness Conference"), made of sessions in order.

1. **Cover.** A 390×280 WallWindow of the series' sessions. If there are fewer than 3, use a `stage` of the first session instead.
2. On the fade:
   - the gold kicker "CONFERENCE · 5 SESSIONS · SEP 2026";
   - the name in `title`, with an italic phrase only if the editor sets one;
   - a `lead` description.
3. **Sessions.** Kickers such as "DAY ONE · MORNING SESSION", then SermonRows in order. The session in progress gets the navy rule. For more than 12 sessions, add FilterChips by day.
4. **Moments from this conference.** MomentRows, if there are any.
5. **Other conferences.** A series rail.
6. **Sticky CTA:** "▶ Start with Day One · 1 hr 47 min" or "▶ Continue Day Two · 1 hr 12 min left".

**References**

- `browse/ascension-series-detail.png`: restraint, with "7 Episodes" and a single button.
- `browse/audible-series-titles.png`: an ordered list grouped by book. Leave the ratings.
- `paths/masterclass-04-course-lessons.png`: numbered lessons on 16:9 artwork with durations. Leave the black.
- `browse/_cand/sequel-series-detail.png`: avoid its Details/Episodes tabs; use one scrolling page.

*Critic:* with today's catalogue, Lioness Conference has 1 session. A one-session series page is a sermon page with extra steps, so a series with 1 session opens its sermon directly, and the "Part of …" row and the Series rail skip it.

### Critic: Topic page

The Topics tab goes, but its cards still need somewhere to go. Today's version is `../shots/09-topic-page.png`: a sans title, an icon well and a disclaimer.

1. **Header.** No icon well.
   - If the topic has 3 or more sermons: a 390×240 WallWindow of them, fading to ivory.
   - Otherwise: no cover.
   - Then the gold kicker "TOPIC · 3 MESSAGES", the topic name in `title` (an italic phrase only if the editor sets one), and its description from `categories.ts` as the `lead`.
2. **Moments on this topic**, when verified moments exist: up to 5 MomentResult cards and "All 12 moments". Moments come before whole sermons, as in principle 5.
3. **A path for this topic**, if one exists: the sand card from Search.
4. **Messages:** SermonRows, newest first. Add FilterChips by need only at 6 or more items.
5. While topic labels are unreviewed: one quiet caption at the very bottom, "Topics are sample labels, not yet checked against each sermon." Remove it once the owner reviews them.

Reference: `browse/wiser-topic-detail.png`. Take the sub-topic chips under the header. Leave the title and buttons laid over the illustration, the illustration itself and Shuffle.

### Critic: "See all" lists

- **Messages** (from "Preached this week" or "Latest messages"): `title` "Messages", then SermonRows grouped by month under gold kickers ("SEPTEMBER 2026"), newest first. A "Sort" control appears only at 20 or more items.
- **Conferences and series:** `title`, then a two-column grid of series cards (a 165×110 sand box with a CardFan, the name in Manrope 600 16, and "3 sessions"). One column at large text (§3.9).
- **All topics:** `title` "Topics", then TopicCards in two columns.
- Each is a pushed page with the 56pt header. The serif title crossfades into the header on scroll.

### Critic: Share a moment

Sharing a verified line from a sermon, with the minute it was said, is the most AAO-specific thing a person can send. It also brings new people straight to the minute.

- **Entry points:** the "…" on a MomentRow or MomentResult, Share on Now Playing while inside a moment, long-press on a saved moment, and Share on A word for today.
- **The sheet:** medium detent, `heading` "Share this moment", a live preview of the ShareCard (§4) at 0.3 scale, then two buttons: "Share image" (primary) and "Copy link" (tonal). The system share sheet opens from "Share image" with the image and the link together.
- **The link:** `/s/<sermonId>?t=<seconds>`, which opens the sermon page at that time (§5 Sermon page, "opening a shared link").
- **The rule:** only a verified quote goes on an image. A moment without one, including every launch-time saved timestamp, shares as a link with the text "Listen from 34:12 · Apostolic Shift: Day One".
- **Build:** `react-native-view-shot` captures an offscreen ShareCard at 1080×1350, and `expo-sharing` (or `Share.share` with the file URL) sends it. Fonts are already loaded. Render the card with the same tokens, so the image looks like the app.

References:
- `share/fiveminute-quote-share.png`: ivory, one centred serif quote, a single share control. Take the restraint. Leave the photo backdrop.
- `share/biblenote-quote-share-editor.png`: avoid. Text over a painting, highlighter marks and a pager of templates. AAO has one card and no editor.
- `share/glorify-share-quote-prompt.png`: avoid. A dark photo and the brand first, with the quote second.

### Account, profile and settings

Account opens from the avatar, as a pushed page.

1. **Identity.**
   - A 64pt navy circle with the initial in Newsreader italic white (the same as the masthead avatar).
   - 12pt below, the name in `title`.
   - The email in a muted caption, and "Signed in with Apple" with its icon.
2. **One quiet line**, shown after an hour of listening: "Since September · 23 hours of teaching · 6 moments kept". No charts, streaks or levels.
3. **Grouped settings.** White, radius 16. Rows are 56pt with a 20pt muted icon, a 16pt label, the value on the right in muted 15, and a chevron. Group labels are Manrope 600 13, muted, in sentence case.

| Group | Rows |
|---|---|
| Your growth | Topics (Prayer, Faith) · Reminders (Off / Daily at 7:00) |
| Playback | Default speed (1×) · Play next automatically · Continue as audio when you leave a video (once audio exists) |
| Account | Name · Email · Sign-in methods |
| About | About AAO · Privacy Policy · Terms of Use · Send feedback · Report a problem |

4. **Sign out**, a full-width secondary button. 32pt below it, **Delete account** as `c.error` text, leading to the existing confirm. Then the version number.

**Guests** see a sand card in place of the identity block:

- the serif headline "Keep your place on every device";
- the line "Save sermons and moments, and pick up where you left off.";
- a primary "Create a free account" and a text button "Sign in".

Settings that need an account are hidden, not disabled.

**References**

- `profile/glorify-settings.png`: values on the right of each row. AAO's are muted, not accent caps.
- `profile/insighttimer-settings.png`: plain-language descriptions under each group.
- `profile/bemyeyes-account-settings.png`: the destructive action set apart.
- `profile/nara-notification-permission.png`: a serif reminder primer with "Not now".

### Onboarding (keep what works)

**Keep:** the welcome wall and its headline, the progress dashes and Skip, the serif questions, the topic cards with circle checks, and the navy Continue.

**Change:**

1. **Topic cards.** A selected card also shows the navy rule on its left edge.
2. **An optional second step,** "Is anything weighing on you right now?". First-person NeedChips (multi-select, wrapping) with Skip. It seeds the Ask row on Home. These answers are preferences only and are never shown back as a label.
3. **Done.** A WallWindow of the chosen topics' sermons, the `hero` "You're *in*, Mufaro.", and one "Start listening" button.
4. **No notification prompt** during onboarding.

Buttons become pills (§3.3).

**References**

- `search/insighttimer-need-chips.png`: the need step.
- `profile/glorify-daily-routine-setup.png`: avoid. A mandatory routine before showing any value.
- `details/lastpass-account-created.png`: avoid. A "Nice! Account created" interstitial.

### Sign-up sheet

Keep the structure of `../shots/12-join-sheet-watch.png`: the context row, the serif headline, Apple, Google, "Use email instead", and the terms. Then:

1. **Context row.** `micro` artwork and "To watch *Pray Without Ceasing*".
2. **Headline.** `question` with one italic verb: "Create a free account to *watch*".
3. **Sign-in buttons.** Apple is a black pill and Google is a white pill with a hairline, both 52pt and 12pt apart. Apple's guidelines require these styles.
4. **Promise line.** "Free. We'll bring you right back to this sermon."
5. **Detents.** Use the medium detent first, so the sermon stays visible above the sheet. Add a grabber.
6. **Test mode.** Remove the "Test mode" footer in production.

**Reference.** `player/pocketcasts-sleeptimer.png`: a half sheet that keeps its context visible.

### Critic: email, code and password screens

These are the screens after "Use email instead" (`../shots/13-auth-email.png`, `../shots/14-auth-code.png`, `../shots/15-auth-password-error.png`). They were unspecified, and they are where a new member forms a first impression after the sheet.

- **Headline.** The `question` serif with one italic phrase: "What's your *email*?", "Check your *inbox*", "Choose a *password*". No sans page titles.
- **Fields.** 56pt minimum, white, radius 16, a hairline `#878279`, and a 1.5pt navy border when focused. The label sits above the field in `label` (never only a placeholder). Use `textContentType` and `autoComplete` (`email`, `oneTimeCode`, `newPassword` / `password`), so the system fills them.
- **Code.** Six boxes, 48×60 minimum, radius 12, Manrope 700 24 with tabular figures. One hidden input owns them, so paste, autofill from Messages and VoiceOver all work ("Digit 3 of 6"). "Send a new code" stays inactive for 30 seconds, and its label shows the countdown.
- **Errors.** In `c.error` text under the field, with a 16pt alert icon (never colour alone). The field border turns `c.error`. The message says what to do: "That code has expired. We've sent a new one."
- **Button.** The primary pill, pinned 16pt above the keyboard, with "Continue" written as what happens next ("Send code", "Create account").
- **Test mode footer.** As on the sheet: never in production builds.

### Empty, error and offline states

| Surface | Loading | Empty | Error | Offline |
|---|---|---|---|---|
| Home | Masthead washes, path card and rail placeholders | n/a | Keep cached content; toast "Couldn't refresh · Try again" | Banner, with cached content |
| Search | 3 MomentResult placeholders | The default state | "Search isn't answering", with Try again | "Search needs a connection", with recent searches still listed |
| Sermon / player | Stage on `c.media`, with a spinner in the play button | n/a | In the stage: "This sermon won't play right now", with Try again and Open in YouTube | "You're offline. Reconnect to watch."; Listen disabled, with the reason |
| Library | Tile and row placeholders | Per section (above) | Inline: "Couldn't load your saved sermons · Try again" | Cached items, with "may be out of date" |
| Paths | Card placeholders | "Paths are coming", with a promise line | Try again | Cached paths; days that aren't available offline say "Needs a connection" |

**Copy.** Say what happened in one sentence and give one action. No exclamation marks, no "Oops", no blame.

**References**

- `details/sofa-up-next-empty.png`: icon well, title, line and tonal CTA.
- `details/hallow-me-ghost-tiles.png`: shapes held in place while empty.
- `details/plannerpro-anchored-toast.png`: a toast anchored near its context.
- `details/nytcooking-empty-grocery-list.png`: a serif empty title.

---

## 6. What not to do

**Colour and theme**

- No dark pages or artwork-tinted players (Spotify, Snipd, Pocket Casts, Castro, immersive's Home and path cover). Only the sermon stage and its scrubber band are dark.
- No new hues: no green success states, no red badges, no gradient buttons.
- No navy cards. Gold never sits on sand.
- No white cards wrapped around artwork, and no shadow under every thumbnail.

**Artwork**

- Don't crop the 16:9 posters into squares, circles or faces.
- Nothing laid over the artwork except the duration chip, the progress bar and the sermon stage's play disc.
- No stock photos, illustrations, mascots or emoji.
- The wall appears only at thresholds, never as a loop or with parallax.

**Pressure and gimmicks**

- No streaks, flames, levels, points, badges, "Amen" counters, or calendars of missed days. See `profile/biblechat-holy-calendar-streak.png`, `profile/insighttimer-streak-calendar.png`, `profile/avoid/praktika-streak-calendar.png` and `profile/avoid/happier-profile.png`.
- No premium, upgrade, padlock, promoted-content or gift UI. See `library/avoid/balance-stress-plan-grid.png`, `profile/avoid/aura-profile.png`, `profile/avoid/calm-profile-login.png` and `library/avoid/blinkist-highlights-empty.png`.
- No locked path days. Immersive and devotional draw a padlock on Day 4; use "UP NEXT" instead.
- No sparkle or "AI" glyphs and no custom microphone button. Say what search does in words.
- No coach marks, tutorials or tooltips announcing new places.
- *Critic:* no UI that promises content the app doesn't have. That means no "What are you going through?" field without need search behind it, no "New" on old sermons, no Paths tab without paths, and no "by meaning" without meaning search (§5 Launch state).
- *Critic:* nothing of ours drawn over the YouTube frame, including header buttons and the band in landscape (§5 Sermon page).
- No social features, likes or public counts.

**Player**

- No shuffle, repeat or previous/next. No trim-silence or voice enhancement. No scrolling marquee titles.
- No speed control in the middle of the time row.
- Never shrink the YouTube frame below 200×200, put controls on it, or play YouTube audio while it's hidden.
- At most four secondary actions visible at once.

**Type and copy**

- No serif in labels, buttons, chips or metadata, and no serif for sermon titles in lists.
- At most one italic phrase per screen, and none inside sermon titles.
- No transformed sermon titles.
- No invented, trimmed-in-meaning or unreviewed quotes. YouTube auto-captions are a draft, not a source.
- No zero counts, no exclamation marks in errors.

**Structure**

- No tabs inside detail pages: each is one scrolling page.
- No four-tile quick-action rows on Home.
- No carousel or pager hero.
- No content shown as settings rows.

---

## 7. How the three concepts were reconciled

| Question | Editorial | Immersive | Devotional | Decision |
|---|---|---|---|---|
| Home threshold | Wall masthead | Dark hero, title over a cropped photo, pager | Plain wordmark, date | **Editorial's wall masthead** plus devotional's date kicker. No dark hero. |
| First Home block | Ask, then Path | Hero, Ask, Path | Path, then Ask | **Greeting → Ask → Path.** Greeting then question reads as one conversation. |
| Path covers | Wall | Dark band with a fan | Wall | **Wall** for pages; **fan** inside cards. |
| Search icon | Search glyph | Sparkle | Sparkle and mic | **Search glyph**; "by meaning" said in words. |
| Quote style | Italic | Upright | Upright with a gold rule | **Upright with a gold rule** for results and moments; **italic** only for 3-line display quotes. |
| Moments on the scrubber | Dots above the track | Ticks | Ticks plus a gold focus bracket | **Ticks plus a gold focus bracket** (gold marks the ministry's choice). |
| Future path days | Up next | Padlock | Padlock | **Up next, no padlock**, with an "Open anyway" choice. |
| "A path for this" | n/a | Navy card | Navy card | **Sand card.** Navy marks the person, not a card. |
| Series covers | Fan in sand | n/a | Square crops | **Fan in sand.** |
| Sermon title on its own page | Serif | Serif with an italic word | Serif | **Serif, no italic word.** |
| 4th tab | Account | Account | Account | **Library**, with Account on the avatar. Needs the owner's OK. |

**Where the concept quotes came from.** The quotes in the concepts were pulled from YouTube auto-caption files in `~/Documents/Curated Sermons/…/transcripts`. Treat them as mock-up text only. Before any quote ships, a person checks it against the recording. The owner also needs to confirm that this folder is an approved content source. `AGENTS.md` says the separate `Sermons` archive is not one.

---

## Build order (suggested)

1. **Tokens.** Add the new type roles, `c.track` and `c.featureOnSurface`, and pill buttons. Build ArtworkFrame, SectionHeader, TimePill and the buttons.
2. **Fix the dock.** Use the MiniPlayer pill with "Paused at 34:12" instead of the docked video.
3. **Sermon page.** The stage with its scrubber band, the ivory panel, the serif title, the pill pair, Moments, and "About this sermon" collapsed.
4. **Home.** The masthead, Ask, Continue, New this week and Series with fans, then the topic cards.
5. **Search.** The default, typing, best match, result and no-result states.
6. **Library**, which needs persisted progress. Then move Saved out of Account.
7. **Paths and Series**, which need their data models. Add A word for today once there are verified moments.
8. **Now Playing extras:** Save this moment, the moment pill and sheet, Playback, and Up next.
9. **Account** restyle.

*Critic: revised order, so the launch build looks finished at every step.*

1. **Tokens and contracts.** As in step 1, plus §3.9 (`minHeight`, large-text breakpoints, hit areas, composed labels) built into the base components from day one. Retrofitting this is what usually slips. Add `expo-image`.
2. **Persist progress** (§5 Library "Data"). Continue watching, "Paused at 34:12", the latest-message resume label and History all depend on it.
3. **Fix the dock** and **the sermon page at launch**: the dark bar above the stage, the band without ticks, the panel, the serif headline, the pill pair, "More from Apostolic Shift", Save this moment as a timestamp, shared links at a time, and landscape.
4. **Home at launch** (§5 Launch state): the masthead, search, Continue, the latest message, the conference programme.
5. **Search at launch** and **Library** with the artwork-led tiles. Move Saved out of Account. Ship three tabs.
6. **Owner decisions** on the spike: native tabs versus the pill, pill buttons, section-heading copy.
7. **When moments are verified:** MomentRow, ticks and "Find the minute", the moment pill, meaning search with BestMatchCard and MomentResult, Share a moment, then A word for today with its queue.
8. **When paths exist:** the Paths tab, path detail, Day complete, reminders.
9. **When audio exists:** Listen and Read, "Continue as audio", lock screen.
10. **Account** restyle, and the sign-in screens.

**The data the design depends on.** None of these may be filled with invented text.

- **Moment:** `{ id, sermonId, at, end, title, quote (reviewed), topics[], needs[] }`
- **Path:** `{ id, name, italicPhrase, why, needs[], days: [{ sermonId, focusStart, focusEnd, theme, keyMomentId }] }`
- **Series:** `{ id, name, kind, sessions: [{ sermonId, label }] }`
- **Progress:** as described under Library.
- *Critic:* **Saved moment:** `{ id, sermonId, at, momentId?, note?, savedAt }`. `momentId` links a verified moment when there is one; `note` is the person's own words. This is what lets Save this moment ship before any transcript exists.
- *Critic:* **Word-for-today queue:** `{ momentId, date? }` (§4 WordForToday).

**Critic: the editorial work behind the design.** Every showpiece in this direction is editorial content, and none of it can be generated. Before building a feature, name who produces its content and how often:

| Content | Work | How often |
|---|---|---|
| Verified moments (time, title, quote checked against the recording, needs) | About 4 to 8 per sermon. Each quote is listened to and checked word for word. | Per new sermon |
| Need chips (10 to 14) | Pick needs with 2 or more verified moments, in first person | Monthly |
| Paths (why, order, focus start and end, theme lines) | One path is 5 to 7 days of the work above, plus writing | Per path |
| A word for today | Fill the queue | Monthly |
| Topic assignments | Review the demo labels; today, 4 sermons × 1 to 2 topics | Once, then per sermon |
| Short headlines and events (`display.ts`) | One line each | Per new sermon |

If nobody owns a row, its feature stays in the launch state. That is a fine product, and much better than invented content.

---

## Critic: open questions for the owner

1. **Content source.** Is the `Curated Sermons` folder an approved catalogue? The concepts and the board look rich partly because they use about a dozen of its sermons. The approved app has 4. Until more are approved, the app ships the launch state (§5).
2. **Who verifies quotes and moments?** Is that you, a ministry volunteer, or nobody yet? The answer decides whether Search by need, quotes, A word for today and Paths are in the first release.
3. **Topics.** Should you review the 4 demo topic assignments now, so topics can appear without the "sample labels" disclaimer? Or should topics stay hidden until they are reviewed?
4. **Tabs.** Home · Search · Library at launch (Paths added later, Account on the avatar). And the native iOS glass tab bar with the mini player built in, or the current custom pill?
5. **Pill buttons everywhere** (§3.3), including onboarding and sign-in?
6. **Landscape** on the sermon page only, for watching full screen sideways?
7. **The preacher's name in captions:** "Apostle Arome Osayi" (the channel's) or "Dr Arome Osayi" (the concepts')?
8. **Section headings in the ministry's voice** ("Pick up where you left off", "Preached this week") or plain labels?
9. **Shareable quote images** that carry the sermon artwork and the "Arome Osayi" wordmark: is the ministry happy for its artwork to travel that way?
