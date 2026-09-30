# Architecture and catalog

## Navigation and presentation

`src/app/` is the Expo Router stack. Browse is `/`; `/library` lists topics; `/library/[categoryId]` selects a topic; `/search` accepts initial `q` and `category` parameters; `/sermon/[id]` combines detail and playback. The menu groups Explore, Account and prototype information. There are no speculative download, saved-item or account-sync controls.

Search text and cleared scope are screen-local state. Returning from details or closing a menu preserves that screen. Choosing a destination already in the root stack pops back to that screen without rewriting its parameters or creating another copy. Empty-topic recovery dismisses to the existing library. Unknown category/sermon links have explicit recovery actions. On web, URL parameters seed the screen on arrival; subsequent typing/filter clearing is not synchronized back into the URL. Reloading or sharing that URL may restore its initial scope/query; there is no share-search feature yet.

`src/theme.ts` holds colors; `src/ui.tsx` provides type, spacing and shared controls. `src/topics.tsx` owns topic chips and the demo notice. The stack respects reduced-motion changes and uses fade instead of translated transitions when enabled. Text containers grow and screens scroll.

## Catalog model

`src/data/sermons.ts` is the single local catalog. `src/data/categories.ts` defines stable editorial IDs. A sermon is stored once even when it belongs to several topics:

```ts
edification: {
  primaryCategoryId: 'spiritual-growth',
  additionalCategoryIds: ['faith'],
  tags: ['discipleship', 'maturity'],
  reviewStatus: 'demo',
}
```

The primary topic appears above each message-card title. Category membership includes primary and secondary IDs. Search intersects the optional selected category with all whitespace-separated query terms across source title, channel, gathering, date, topic labels and tags. Current counts are Spiritual Growth 3, Prayer 2, Faith 2 and Christian Living 0. The empty category is intentional.

**Every topic/tag assignment is dummy data requested for the prototype. No sermon theology or message content has been reviewed.** The UI says “Demo” and displays the notice. Do not turn `reviewStatus` into “approved” without a defined editorial review process.

Verified source fields remain separate: exact `title`, uploader `channel` (not a guarantee of the only speaker), source URL, source page, source thumbnail and ministry-listed duration. Dates appear in the source titles. The four provisional sources are [RCN North America](https://www.rcnnorthamerica.com/) and the linked public [YouTube channel](https://www.youtube.com/@ApostleAromeOsayi). Source spellings are preserved. Do not derive theology, Scripture citations or descriptive summaries from a title.

## Future persistence

No database/service has been selected or connected. The in-memory model can later map to `sermons`, `categories`, a sermon/category join table (including primary status), and tags. Preserve stable category IDs independently of editable display labels; separate provider/video identity from an app-owned sermon ID when adding another provider. Add verified-at/source provenance and editorial review fields through an explicit migration. Only ingest explicitly approved source material.

Keep querying behind `sermonsInCategory` / `searchSermons` or a future repository adapter so screens need not know whether content comes from a file, cache or service. A later ingestion process must validate unique IDs, topic references, source rights and provider availability; the current tests cover the local invariants. User libraries, accounts and cross-device progress require separate product/backend decisions.

## Media and demo accounts

`src/player/Embed.web.tsx` uses YouTube’s official IFrame API; `Embed.tsx` hosts it in a native WebView. `SermonPlayer.tsx` owns presentation and recovery. Media loads after a user action, uses provider controls and a viewport at least 200×200, and is removed when inactive. A ref retains ephemeral position for manual restart within the mounted screen. No background audio, extraction, download or permanent watch history exists. YouTube is provisional; Vimeo/Bunny remain possible later decisions.

`src/state/demo.tsx` contains only an in-memory simulated signed-in flag. Form credentials stay inside their screen and clear on blur/close/mode replacement. They are never transmitted, logged or written to storage. Reset sends no email. Tests instrument network and persistent-storage APIs. Third-party thumbnail/player traffic is independent of account simulation and is described in the draft privacy screen.
