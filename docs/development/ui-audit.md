# UI audit — 30 September 2026

These audits were made on the earlier dark teal / mint "direction B" palette. On 14 October 2026 the user chose the ivory-and-navy palette; it hasn't been through this audit yet, so the colour and contrast rows below describe the old palette. Contrast ratios computed from the new `src/theme.ts` tokens (WCAG formula, not a rendered measurement): text on ivory 15.21:1, on white 16.70:1, on sand 13.82:1; muted on ivory 5.69:1, on white 6.24:1, on sand 5.17:1; white on navy 11.48:1; navy on ivory 10.46:1; error on ivory 5.95:1; gold on ivory 4.82:1 and on white 5.29:1, but gold on sand is 4.38:1, under 4.5:1, so small gold text belongs on ivory or white only.

Scope: the topic/library/menu extension of direction B, plus shared controls and navigation. Guidance applied from [Animate Expo](https://www.ui-skills.com/skills/emilkowalski/animate-expo) and [Better Layout](https://www.ui-skills.com/skills/jakubkrehel/better-layout). Reading those resources is not a compliance result. The observations below distinguish measured browser evidence, source inspection and remaining native checks.

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Visual hierarchy / proximity | Pass in inspected browser renders | Shared 22-unit page edge; direction B colours and Manrope retained. Grouped lists (Account › About) use 28-unit separation between groups with divided single-surface rows. Topic description/count stay with each heading. Main actions are distinct. |
| Labels and category choice | Pass | Row kickers show topic names; the notice “Topics are sample labels, not yet checked against each sermon.” appears on every list/detail screen that shows them, and each row's accessible name includes “Sample topics: …”. Dedicated topic library and counts; search filters by topic in place with a selected chip. |
| Touch targets | Pass in measured browser routes | Every measured button in Browse, Menu, Library, Prayer, scoped Search and empty topic is at least 48×48 CSS px. Source uses minimum48 logical units; native 44pt/48dp measurements remain unverified. |
| Text contrast | Pass for used theme pairs | Main text/background 16.63:1; main text/surface13.65:1; muted/feature4.93:1 (lowest normal-text pairing); mint/ink12.74:1. These exceed 4.5:1 normal and 3:1 large text. Provider/video imagery is outside theme control. |
| Small/wide layout | Pass in inspected browser samples | Topic library checked at320,393 and1440px. Shared max-width760 avoids stretched reading columns; no document horizontal overflow. |
| Enlarged text | Pass for sampled topic library; native unverified | Browser text-size/line-height doubled to200%: header and topic rows grew without horizontal overflow; empty-topic recovery remained actionable. This is a browser stress test, not Dynamic Type coverage of every screen. |
| Back / dismiss / reset | Pass in automated web tests | Topic→search→detail→back preserves query/scope; menu destinations reuse existing ancestor screens and preserve their state; empty topic recovers without duplicate index; unknown links recover explicitly. Native gesture/hardware Back remains unverified. |
| Reduced motion | Source implemented; native unverified | Root subscribes to accessibility preference changes and uses fade rather than translated stack transition when enabled; default is reduced until preference resolves. No custom looping animation added. Actual native transition/performance remains unverified. |
| Empty/error meaning | Pass in browser checks | Empty category says no sermons have been added yet; invalid category differs from no results; clear query / clear topic are distinct. Provider errors retain retry and external fallback. |
| Accessibility semantics | Partial / not fully verified | Named buttons, visible labels, search controls and semantic headings inspected; no per-second live announcement in player. VoiceOver/TalkBack focus order, keyboard/native focus after transitions, screen reader announcements and RTL remain unverified. |
| Playback/native identity | Not verified on phone | Official web playback was measured previously. Android/iOS bundle export passes; native WebView/fullscreen/external-window behavior still requires a physical device or configured emulator. |

No claim of full WCAG conformance or complete native accessibility is made. Before release, complete the documented native checklist, full large-text sweep and RTL/localization testing. The current English-only design does not claim multilingual support.


## Frontend UX pass 2 (tabs and app-wide player) — 30 September 2026

Measured in Chrome at 393×852, 320×568 and 197px wide (a 393pt phone at 200% zoom), plus a browser text-doubling stress test. Research drew on 22 ui-skills.com skills (Emil Kowalski's animate-expo, emil-design-eng, apple-design, review-animations; Jakub Krehel's better-interface, better-layout, better-ui, better-typography, better-accessibility, better-writing, make-interfaces-feel-better; others listed in the pass handoff).

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Overflow and touch targets | Pass on 45 captured states | No document horizontal overflow; no control under 44 CSS px (tabs, chips, segments, transport and dock controls are ≥48). Native pt/dp not measured. |
| Headings | Pass (web) | One visible h1 per screen; sections are h2 via `aria-level`. |
| Keyboard (web) | Pass | Browser focus ring kept on pressables; Space selects radios and tabs; busy submit keeps focus and reports aria-busy. |
| Announcements | Web: pass for semantics; speech not tested | Field and player errors are role=alert on web; result count and player status are polite live regions; iOS gets announcements for loading, ended and errors. No real screen-reader speech was tested. |
| Motion | Web: pass | Press feedback 120ms strong ease-out (0.97 / 0.98), dim under Reduce Motion (live setting); tabs don't animate; platform push. Feel on device not judged. |
| Player | Web: pass, live YouTube | Watch starts playback; provider never covered once ready; ≥200×200 full and docked; same provider frame after docking; closes cleanly; pauses when hidden. Native WebView behaviour unverified. |
| Large text | Partial | Layout switches use width ÷ fontScale; verified on web only by narrow widths and zoom (RN-web reports fontScale 1). Native Dynamic Type/Android font scale unverified. |

### Second adversarial review (player and tabs)

26 findings survived verification (several were duplicates from different reviewers); all were fixed, with web regression tests where the web can show the bug (`tests/player.spec.ts`, new cases in `tests/topics.spec.ts`). Four of the fixed tests were checked against the old code and failed there.

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Start cancelled by pause | Pass (web) | Leaving the app, or Watch on YouTube, while the player loads no longer lets the queued start play the sermon. iOS "inactive" (Control Center) no longer pauses. |
| Player loading robustness | Pass (web) | No uncaught errors while a slow player loads; a stalled IFrame API script is removed after 12s so Try again reloads it. Native: the WebView's page being shut down now shows "The player stopped" with Try again (needs a device to trigger). |
| 200% zoom / short windows | Pass (web, 640×360; live YouTube) | Full player height is capped so the title and controls scroll into view; where a docked video would leave under 160px of page, the dock becomes a bar and pauses (the hidden video never plays), and reopening resumes the same player. |
| Focus | Pass (web) | Watch and Try again move focus to Play/Pause; closing the dock focuses the selected tab or Back; focused controls scroll clear of the dock (`scroll-padding-bottom`); a "Go to video player" skip link after Back reaches the player, whose region is named. |
| Scrubber | Pass (web) | Exposed as a slider with value min/max/now/text; arrows step like the skip buttons, Home/End jump; drag and tap seek via gesture-handler. Native: sideways drags scrub and vertical swipes scroll the page (needs a device). |
| Dock announcements | Pass (web) | The dock's name carries its status; failures are an alert and "Sermon ended." is polite on web. |
| Navigation | Pass (web) | A swallowed double-tap Back no longer locks the next Back; links straight to a sermon or topic open over Home (`anchor: "(tabs)"`); Home's search keeps the Search tab's query and filter; web exits no longer leave a dead browser Back entry. |
| Native-only fixes | iOS Simulator: partly verified | Verified on the iOS 27 simulator (below): swipe-back docking and cancel, tab labels capped at 1.4×, dock above the measured tab bar. Not verified: VoiceOver speech, tab traits and activation (the simulator has no VoiceOver). |

### iOS Simulator, 30 September 2026 (Xcode 27, iOS 27, iPhone 18 Pro Max)

Development build with the app's own identity; evidence in `artifacts/ux-pass/native/`.

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Expo Go | Error 153, handled | YouTube refuses the embed in Expo Go (not the app's identity); the app shows the error with Watch on YouTube, no dead controls. |
| Native playback | Pass | One tap on Watch plays (no second tap in YouTube). App Pause, Forward 30 and Play drive the provider through the injected channel; YouTube's own controls show uncovered and its time matches the app's. |
| Scrubber | Pass | A sideways drag with vertical wobble seeks to the release point (57% → 2:03:56, YouTube 2:03:57) without moving the page; a vertical swipe starting on the scrubber scrolls the page and seeks nothing. |
| Dock | Pass | Back docks the same player above the tab bar, still playing; it keeps playing across tabs; tapping it returns the player to Now Playing at the same time. |
| Background | Pass | Home button pauses; returning shows Paused with the same player. |
| Swipe-back | Pass after a fix | The video docks as the gesture starts and returns to its slot on cancel. Found and fixed: mid-gesture the dock sat at the very bottom and jumped up when the pop finished; it now sits above the tab bar throughout. |
| Largest text (AX5) | Pass after a fix | Cold start: every screen lays out, no clipping; tab labels cap at 1.4×. Found and fixed: changing text size while the app was backgrounded left Home's header and search box at their old heights; text now re-measures on a font-scale change. |
| iOS 27 launch | Pass after a fix | The generated app crashed at launch (no scene life cycle); fixed by `plugins/with-ios-scene-lifecycle.js`, verified from a clean prebuild. |
| Smoothness | Simulator only | Release build: scrolling and the sermon push render at ~60fps with occasional single dropped frames (`release-walkthrough.mp4`). The simulator runs at 60Hz on a Mac GPU; real 120Hz ProMotion devices, press feel and thermal behaviour need a phone. |
| Not verified | — | Android (no emulator), VoiceOver speech and focus, physical-device performance, fullscreen video, network interruption. |

### Browser review follow-up (30 September 2026)

A reviewer's desktop-browser pass led to calmer controls, feedback in the video area, headlines, a capped desktop video (45% of the window height) and a corner mini-player on wide windows. An independent review of that change confirmed 4 defects, all fixed with tests:
- A start that buffers or falls back to paused no longer goes silent. It says "Still loading", then "Tap play in the video".
- Focus moves to the error's first action when a failure removes the focused control.
- The error area grows with large text instead of clipping.
- A poster scrolls with the page, so another sermon's page keeps room when one is docked.

Playwright 57/57, lint and types clean, live YouTube probe pass, and the redeployed web link checked live.

