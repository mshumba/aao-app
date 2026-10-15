/**
 * The approved Immersive concept's shared pieces (14 October 2026). Screens
 * compose these; values come from theme.ts. See src/app/kit.tsx (dev only)
 * for every component with test data.
 */
export { Artwork, artCandidates, artUri, sizedArt, type ArtSource, type ArtworkProps } from "./Artwork";
export { CardFan, fanSize, type FanSize } from "./CardFan";
export { ItalicTitle, Kicker, Quote, SectionHeader, Strong, TrustLine, curly, splitItalic } from "./text";
export type { ItalicTitleProps, KickerTone } from "./text";
export { ChipRow, FilterChip, NeedChip, type ChipVariant } from "./chips";
export { SearchField, type SearchFieldProps } from "./SearchField";
export {
  Avatar,
  PagerDots,
  PlayPill,
  RoundButton,
  StickyCTA,
  TimeLeft,
  useStickyCTASpace,
  type PillSize,
  type PillTone,
  type RoundTone,
} from "./buttons";
export { PathProgress, type ProgressTone } from "./PathProgress";
export { MomentCard, MomentRow, QuotePlaceholder, type MomentCardProps, type MomentRowState } from "./moments";
export { PartOfPathRow, PathCardNavy, type PathCardNavyProps } from "./paths";
export { DayRow, DayTimeline, type DayRowProps, type DayState } from "./DayTimeline";
export { RouteIcon } from "./RouteIcon";
export { Card, ListGroup, ListRow, type CardTone } from "./surfaces";
export { CoverPage } from "./CoverPage";
export { Wash } from "./Wash";
export {
  clockText,
  durationText,
  leftText,
  parseDuration,
  spokenKicker,
  spokenText,
  spokenTime,
} from "./time";
