/**
 * Presentation only: a deep tint sampled from each sermon's verified YouTube
 * thumbnail, shown behind artwork while it loads. Not source metadata.
 */
export const artworkTint: Record<string, string> = {
  nUW8NT2Pe88: "#4c202a",
  H9sRbSUt0YE: "#1d454c",
  yUDzMcZsVk8: "#4c1617",
  WYiA7rjenVI: "#4c2b16",
};

/**
 * The same hues as pale tiles, behind the welcome collage's artwork while it
 * loads (each tint's hue at OKLCH lightness 0.93, chroma 0.02). Sermon pages
 * stay plain ivory: the user preferred no per-sermon tint.
 */
export const artworkWash: Record<string, string> = {
  nUW8NT2Pe88: "#f5e3e5",
  H9sRbSUt0YE: "#daecef",
  yUDzMcZsVk8: "#f5e3e2",
  WYiA7rjenVI: "#f3e5dc",
};
