/** Stable editorial keys for edification topics. See edification.ts. */
export const categories = [
  {
    id: "spiritual-growth",
    label: "Spiritual Growth",
    description: "Deepening your walk with God, one step at a time.",
    icon: "leaf-outline",
  },
  {
    id: "prayer",
    label: "Prayer",
    description: "Making room for communion, devotion and a life of prayer.",
    icon: "chatbubble-ellipses-outline",
  },
  {
    id: "faith",
    label: "Faith",
    description: "Growing in trust, conviction and confidence in God.",
    icon: "sunny-outline",
  },
  {
    id: "christian-living",
    label: "Christian Living",
    description: "Bringing the Word into the rhythms of everyday life.",
    icon: "footsteps-outline",
  },
] as const;
export type Category = (typeof categories)[number];
export type CategoryId = Category["id"];
export function getCategory(id?: string): Category | undefined {
  return categories.find((category) => category.id === id);
}
export const topicDisclaimer =
  "Topics are sample labels, not yet checked against each sermon.";
