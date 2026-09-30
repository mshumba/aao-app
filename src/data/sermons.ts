import { CategoryId, EdificationAssignment, getCategory } from "./categories";

export type Sermon = {
  id: string;
  title: string;
  channel: string;
  duration: string;
  date: string;
  collection: string;
  thumbnail: string;
  source: string;
  sourcePage: string;
  edification: EdificationAssignment;
};
const sourcePage = "https://www.rcnnorthamerica.com/";
export const sermons: Sermon[] = [
  {
    id: "nUW8NT2Pe88",
    title:
      "LIONESS CONFERENCE || PRAY WITHOUT CEASING || GRAND FINALE || 27TH SEPTEMBER 2026",
    channel: "Apostle Arome Osayi",
    duration: "3 hr 35 min",
    date: "27 Sep 2026",
    collection: "Lioness Conference",
    thumbnail: "https://i.ytimg.com/vi/nUW8NT2Pe88/maxresdefault.jpg",
    source: "https://www.youtube.com/watch?v=nUW8NT2Pe88",
    sourcePage: sourcePage,
    edification: {
      primaryCategoryId: "prayer",
      additionalCategoryIds: ["spiritual-growth"],
      tags: ["devotion", "consistency"],
      reviewStatus: "demo",
    },
  },
  {
    id: "H9sRbSUt0YE",
    title:
      "APOSTOLIC SHIFT | GRAND FINALE | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
    channel: "Apostle Arome Osayi",
    duration: "2 hr 28 min",
    date: "23 Sep 2026",
    collection: "Apostolic Shift",
    thumbnail: "https://i.ytimg.com/vi/H9sRbSUt0YE/maxresdefault.jpg",
    source: "https://www.youtube.com/watch?v=H9sRbSUt0YE",
    sourcePage: sourcePage,
    edification: {
      primaryCategoryId: "spiritual-growth",
      additionalCategoryIds: ["faith"],
      tags: ["discipleship", "maturity"],
      reviewStatus: "demo",
    },
  },
  {
    id: "yUDzMcZsVk8",
    title:
      "APOSTOLIC SHIFT | DAY TWO MORNING | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
    channel: "Apostle Arome Osayi",
    duration: "2 hr 49 min",
    date: "23 Sep 2026",
    collection: "Apostolic Shift",
    thumbnail: "https://i.ytimg.com/vi/yUDzMcZsVk8/maxresdefault.jpg",
    source: "https://www.youtube.com/watch?v=yUDzMcZsVk8",
    sourcePage: sourcePage,
    edification: {
      primaryCategoryId: "faith",
      additionalCategoryIds: [],
      tags: ["trust", "confidence"],
      reviewStatus: "demo",
    },
  },
  {
    id: "WYiA7rjenVI",
    title:
      "APOSTOLIC SHIFT | DAY ONE | Apostle Arome Osayi LIVE | The Votage | 22/09/26",
    channel: "Apostle Arome Osayi",
    duration: "1 hr 47 min",
    date: "22 Sep 2026",
    collection: "Apostolic Shift",
    thumbnail: "https://i.ytimg.com/vi/WYiA7rjenVI/maxresdefault.jpg",
    source: "https://www.youtube.com/watch?v=WYiA7rjenVI",
    sourcePage: sourcePage,
    edification: {
      primaryCategoryId: "spiritual-growth",
      additionalCategoryIds: ["prayer"],
      tags: ["walking with God", "devotion"],
      reviewStatus: "demo",
    },
  },
];
/** A message is stored once, even when it belongs to several topics. */
export function sermonCategoryIds(sermon: Sermon): CategoryId[] {
  return [
    ...new Set([
      sermon.edification.primaryCategoryId,
      ...sermon.edification.additionalCategoryIds,
    ]),
  ];
}
export function sermonsInCategory(categoryId: CategoryId): Sermon[] {
  return sermons.filter((sermon) =>
    sermonCategoryIds(sermon).includes(categoryId),
  );
}
export function searchSermons(
  query: string,
  categoryId?: CategoryId,
): Sermon[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const candidates = categoryId ? sermonsInCategory(categoryId) : sermons;
  return candidates.filter((sermon) => {
    const text = [
      sermon.title,
      sermon.channel,
      sermon.collection,
      sermon.date,
      ...sermonCategoryIds(sermon).map((id) => getCategory(id)?.label || ""),
      ...sermon.edification.tags,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
