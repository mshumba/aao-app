import type { Sermon } from "./sermons";

/**
 * Editorial presentation, not source metadata: a short headline and the event
 * for each sermon, shortened from its verified YouTube title (user decision,
 * 30 September 2026). The exact title stays in sermons.ts, is shown in the
 * sermon's details and is still searched.
 */
type SermonDisplay = { headline: string; event: string };

const display: Record<string, SermonDisplay> = {
  nUW8NT2Pe88: {
    headline: "Pray Without Ceasing",
    event: "Lioness Conference · Grand Finale",
  },
  H9sRbSUt0YE: { headline: "Apostolic Shift: Grand Finale", event: "The Votage" },
  yUDzMcZsVk8: {
    headline: "Apostolic Shift: Day Two Morning",
    event: "The Votage",
  },
  WYiA7rjenVI: { headline: "Apostolic Shift: Day One", event: "The Votage" },
};

/** The short headline, or the verified title when none has been written. */
export function headline(sermon: Sermon) {
  return display[sermon.id]?.headline ?? sermon.title;
}

/** The event line under a headline, e.g. "Lioness Conference · Grand Finale". */
export function eventLine(sermon: Sermon) {
  return display[sermon.id]?.event ?? sermon.collection;
}

export const displayIds = Object.keys(display);
