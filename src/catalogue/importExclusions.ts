/** Videos deliberately left out of future imports, keyed by public YouTube ID.
 * Add an editorial reason when the owner identifies a video to exclude.
 * This prevents new inserts only; it never deletes existing catalogue rows.
 */
export const importExclusions: Readonly<Record<string, string>> = {};
