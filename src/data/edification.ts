import { CategoryId } from "./categories";

/**
 * Demo topic assignments, kept apart from the verified catalogue in
 * sermons.ts. They illustrate how sermons could be organised by how they
 * edify; nobody has reviewed them against the sermons' content.
 */
export type EdificationAssignment = {
  primaryCategoryId: CategoryId;
  additionalCategoryIds: CategoryId[];
  tags: string[];
  reviewStatus: "demo";
};

export const assignments: Record<string, EdificationAssignment> = {
  nUW8NT2Pe88: {
    primaryCategoryId: "prayer",
    additionalCategoryIds: ["spiritual-growth"],
    tags: ["devotion", "consistency"],
    reviewStatus: "demo",
  },
  H9sRbSUt0YE: {
    primaryCategoryId: "spiritual-growth",
    additionalCategoryIds: ["faith"],
    tags: ["discipleship", "maturity"],
    reviewStatus: "demo",
  },
  yUDzMcZsVk8: {
    primaryCategoryId: "faith",
    additionalCategoryIds: [],
    tags: ["trust", "confidence"],
    reviewStatus: "demo",
  },
  WYiA7rjenVI: {
    primaryCategoryId: "spiritual-growth",
    additionalCategoryIds: ["prayer"],
    tags: ["walking with God", "devotion"],
    reviewStatus: "demo",
  },
};
