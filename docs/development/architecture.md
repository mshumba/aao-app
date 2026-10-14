# Architecture and catalog

## Navigation and presentation

`src/app/` is an Expo Router root stack whose first screen is the `(tabs)` group: **Home** `/`, **Topics** `/topics`, **Search** `/search` (accepts initial `q` and `category` and filters by topic in place) and **Account** `/account` (demo account card plus About, Privacy and Sample screens). `src/tabBar.tsx` draws the floating tab pill; switching tabs doesn't animate. Topic pages `/topics/[categoryId]`, sermons `/sermon/[id]`, the demo forms `/account/[mode]`, About, Privacy and Sample screens open over the tabs with a Back (or Close) button. There are no speculative download, saved-item or account-sync controls.

Each tab keeps its own state (typed search, filter, scroll) while you switch. Screens opened over the tabs return with Back; recovery actions ("Browse other topics", "Back to sermons", "Continue as guest") use `exitTo` in `src/navigation.ts`, which returns to the existing tab instead of stacking another (`router.dismissTo` on native; on web, close then switch tab, so browser history keeps one entry per place). The root stack is anchored on `(tabs)`, so a link straight to a sermon or topic opens over Home. Unknown category/sermon links have explicit recovery actions. Route params are normalised (`firstParam`), so a repeated parameter can't break a screen. On web, URL parameters seed the screen on arrival; subsequent typing/filter changes aren't synchronised back into the URL.

`src/theme.ts` holds colour, spacing, radius, type-role and press tokens; `src/ui.tsx` provides shared controls (`Tap` press feedback, buttons, headings with real levels, `SermonTitle`, `SermonRow`, state panels). `src/topics.tsx` owns the topic grid, rows, tags, search filter and the sample-topic notice. `src/navigation.ts` drops repeated taps: each control is locked after it navigates, and an app-wide 350ms window stops a double tap on Back from popping two screens. `src/motion.tsx` keeps the system Reduce Motion setting live for the stack (platform push, or fade) and press feedback (scale, or dim). Side-by-side layouts stack when the reading column is narrow at the user's text size. Text containers grow and screens scroll.

## Catalog model

`src/data/sermons.ts` is the single local catalog of verified source metadata only. `src/data/categories.ts` defines stable editorial IDs. Topic assignments live separately in `src/data/edification.ts`, keyed by sermon ID, so a sermon is stored once even when it belongs to several topics:

```ts
H9sRbSUt0YE: {
  primaryCategoryId: 'spiritual-growth',
  additionalCategoryIds: ['faith'],
  tags: ['discipleship', 'maturity'],
  reviewStatus: 'demo',
}
```

A sermon's topic labels (primary first, or the topic being browsed first) appear above each row's title. Category membership includes primary and secondary IDs. Search intersects the optional selected category with all whitespace-separated query terms across source title, channel, gathering, date, topic labels and tags. Current counts are Spiritual Growth 3, Prayer 2, Faith 2 and Christian Living 0. The empty category is intentional.

**Every topic/tag assignment is dummy data requested for the prototype. No sermon theology or message content has been reviewed.** Each screen that shows topic labels displays the notice “Topics are sample labels, not yet checked against each sermon.”, and each row's accessible name says “Sample topics”. Verified titles are never reformatted; `SermonTitle` only draws the “|” separators in the system face so they don't read as a capital I. Do not turn `reviewStatus` into “approved” without a defined editorial review process.

Verified source fields remain separate: exact `title`, uploader `channel` (not a guarantee of the only speaker), source URL, source page, source thumbnail and ministry-listed duration. Dates appear in the source titles. The four provisional sources are [RCN North America](https://www.rcnnorthamerica.com/) and the linked public [YouTube channel](https://www.youtube.com/@ApostleAromeOsayi). Source spellings are preserved. Do not derive theology, Scripture citations or descriptive summaries from a title.

## Future persistence

No database/service has been selected or connected. The in-memory model can later map to `sermons`, `categories`, a sermon/category join table (including primary status), and tags. Preserve stable category IDs independently of editable display labels; separate provider/video identity from an app-owned sermon ID when adding another provider. Add verified-at/source provenance and editorial review fields through an explicit migration. Only ingest explicitly approved source material.

Keep querying behind `sermonsInCategory` / `searchSermons` or a future repository adapter so screens need not know whether content comes from a file, cache or service. A later ingestion process must validate unique IDs, topic references, source rights and provider availability; the current tests cover the local invariants. User libraries, accounts and cross-device progress require separate product/backend decisions.

## Media and demo accounts

There is **one YouTube player for the whole app** (user decision, 30 September 2026). `src/player/PlayerProvider.tsx` owns the loaded sermon and playback state (a slow "session" context and a per-second "playback" context). `src/player/PlayerHost.tsx`, rendered above the navigator in the root layout, draws the single embed either in the sermon screen's Now Playing slot or docked above the tab bar; the embed keeps the same place in the tree in both, so moving never reloads or restarts it. `src/player/layout.ts` gives the slot and the host the same geometry, and the sermon screen tells the host it is ready once its push transition ends. `src/player/NowPlaying.tsx` has the app's transport (play/pause, back 15s, forward 30s, scrubber, speed); `Embed.web.tsx` / `Embed.tsx` send those commands through the official IFrame API (`playVideo`, `pauseVideo`, `seekTo`, `setPlaybackRate`) and report state, time and duration. YouTube's own controls stay visible; nothing covers the provider once it is ready; the video is at least 200×200 full or docked. The tab bar and dock bar measure themselves (`useChrome` in `layout.ts`), so the dock sits correctly at any text size. On a window too short for a docked video to leave 160px of page (a zoomed-in browser), the dock is a bar only: the video is hidden, paused and kept mounted, and reopening Now Playing resumes it. The scrubber uses react-native-gesture-handler (`GestureHandlerRootView` at the root) so sideways drags scrub and vertical swipes scroll the page.

Playback only starts from the viewer's tap on **Watch sermon** or Play. Because the app's Play must be able to start the provider, the native WebView sets `mediaPlaybackRequiresUserAction={false}`; no code path plays without a tap. Leaving the app (background, not iOS "inactive") pauses the sermon (no background audio), and a pause while the player is still loading cancels the queued start. Closing the dock removes the player. Errors that retrying can't fix (removed, embedding disabled, unidentified player) offer Watch on YouTube instead of Try again. No extraction, download or permanent watch history exists. YouTube is provisional; Vimeo/Bunny remain possible later decisions, and would be needed for lock-screen or background audio.

`src/state/demo.tsx` contains only an in-memory simulated signed-in flag. Form credentials stay inside their screen and clear on blur/close/mode replacement. They are never transmitted, logged or written to storage. Reset sends no email. Tests instrument network and persistent-storage APIs. Third-party thumbnail/player traffic is independent of account simulation and is described in the draft privacy screen.

## Native project

The native projects are generated (`ios/`, `android/` are git-ignored). `plugins/with-ios-scene-lifecycle.js` switches the generated iOS app to Expo's `ExpoAppSceneDelegate`, because iOS 27 won't launch an app built with its SDK without the scene life cycle; remove it once Expo's template adopts scenes. The display name is "AAO" until a production name is chosen; the bundle identifier `com.aao.prototype` still needs a production value, and the app has no icon yet.

## Headlines and player states (30 September 2026, user decision)

`src/data/display.ts` holds short editorial headlines and event lines, shortened from the verified titles. Rows, Home, Now Playing and the dock lead with them; the exact title stays in `sermons.ts`, is shown under "On YouTube" on the sermon screen and is still searched. The Now Playing controls are back 15 / play-pause / forward 30 with speed between the times. The status line is always announced but shown only when it asks something of the viewer: loading, press play, still loading, tap play in the video (a browser refused the app's start), or ended. A failure is shown where the video was, with only the actions that can work, and takes keyboard focus when it removed the focused control. Only a playing video is pinned; a poster or error scrolls with the page.

