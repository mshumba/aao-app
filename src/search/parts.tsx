import { memo, useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { catalogueMode, useCatalogue } from "../catalogue/CatalogueProvider";
import { eventLine, headline } from "../data/display";
import { sermonsInTopic, type Sermon } from "../data/sermons";
import { Artwork, NeedChip, spokenText } from "../kit";
import { Spark } from "../kit/Spark";
import { searchSermonMeta, useTopics, type Need, type SearchSermon } from "../learning";
import { useGo } from "../navigation";
import { sermonCount, topicHref } from "../topics";
import { c, font, radius, shadows, tabular, textCap, type } from "../theme";
import { Heading, Icon, SermonTitle, T, Tap, TextButton, nowrap, type IconName } from "../ui";

/**
 * The pieces of the Search tab (concept screen 02 and the design doc's
 * Search section): headings, rows, the need cloud, topic cards and the calm
 * states. Each row is one accessible element with its words composed.
 */

// ---- Section heading ----------------------------------------------------------------

/**
 * A serif section title (21/27, as concept screen 02 sets "Moments that
 * speak to this") with a muted count or a text action on its baseline.
 */
export const ListHeading = memo(function ListHeading({
  title,
  count,
  spokenCount,
  countTestID,
  action,
}: {
  title: string;
  count?: string;
  /** How the count is read ("14 moments found" for "14 found"). */
  spokenCount?: string;
  countTestID?: string;
  action?: { label: string; onPress: () => void; hint?: string };
}) {
  return (
    <View style={styles.heading}>
      {/* Wrapping beside the count, its last word never stands alone. */}
      <Heading level={2} style={styles.headingTitle} maxFontSizeMultiplier={textCap.section}>
        {title.replace(/ (?=\S+$)/, "\u00a0")}
      </Heading>
      {action ? (
        <View style={styles.headingAction}>
          <TextButton label={action.label} onPress={action.onPress} hint={action.hint} align="end" />
        </View>
      ) : count ? (
        Platform.OS === "web" && spokenCount && spokenCount !== count ? (
          // The web drops a label on plain text: the words are read from an
          // unseen copy, and the visible count is hidden from screen readers.
          <View style={styles.countWrap}>
            <T testID={countTestID} style={styles.count} aria-hidden maxFontSizeMultiplier={textCap.section}>
              {count}
            </T>
            <T style={styles.hidden}>{spokenCount}</T>
          </View>
        ) : (
          <T
            testID={countTestID}
            style={[styles.count, styles.countWrap]}
            accessibilityLabel={spokenCount ?? count}
            maxFontSizeMultiplier={textCap.section}
          >
            {count}
          </T>
        )
      ) : null}
    </View>
  );
});

// ---- Sermon rows ------------------------------------------------------------------------

/** A sermon from the catalogue: art, headline, event and date. */
export const SermonResult = memo(function SermonResult({
  sermon,
  onOpen,
  first,
}: {
  sermon: Sermon;
  onOpen: (id: string) => void;
  first?: boolean;
}) {
  const title = headline(sermon);
  const event = eventLine(sermon);
  const meta = [event, sermon.date && nowrap(sermon.date), sermon.duration && nowrap(sermon.duration)]
    .filter(Boolean)
    .join(" · ");
  return (
    <SermonLine
      id={sermon.id}
      art={sermon}
      title={title}
      meta={meta}
      label={`${title}. ${spokenText(meta.replace(/\u00a0/g, " ")).replace(/ · /g, ", ")}.`}
      onOpen={onOpen}
      first={first}
    />
  );
});

/** A sermon search found moments in, with how many. */
export const FoundSermon = memo(function FoundSermon({
  sermon,
  onOpen,
  first,
}: {
  sermon: SearchSermon & { moments: number };
  onOpen: (id: string) => void;
  first?: boolean;
}) {
  const art = useMemo(
    () => ({ id: sermon.youtubeId, thumbnail: sermon.thumbnailUrl }),
    [sermon.youtubeId, sermon.thumbnailUrl],
  );
  const meta = searchSermonMeta(sermon);
  const count = `${sermon.moments} moment${sermon.moments === 1 ? "" : "s"} on this`;
  return (
    <SermonLine
      id={sermon.youtubeId}
      art={art}
      title={sermon.headline}
      meta={meta}
      extra={count}
      label={`${sermon.headline}. ${spokenText(meta.replace(/\u00a0/g, " ")).replace(/ · /g, ", ")}. ${count}.`}
      onOpen={onOpen}
      first={first}
    />
  );
});

function SermonLine({
  id,
  art,
  title,
  meta,
  extra,
  label,
  onOpen,
  first,
}: {
  id: string;
  art: { id: string; thumbnail?: string | null };
  title: string;
  meta: string;
  extra?: string;
  label: string;
  onOpen: (id: string) => void;
  first?: boolean;
}) {
  return (
    <Tap
      testID="sermon-row"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onOpen(id)}
      unstable_pressDelay={60}
      feedback="highlight"
      highlightColor={c.feature}
      style={styles.sermon}
    >
      {first ? null : <View style={styles.divider} />}
      <Artwork art={art} width={96} radius={10} fallback={title} />
      <View style={styles.sermonText}>
        <SermonTitle title={title} style={styles.sermonTitle} numberOfLines={2} />
        <T style={styles.sermonMeta} numberOfLines={2}>
          {meta}
        </T>
        {extra ? <T style={styles.sermonExtra}>{extra}</T> : null}
      </View>
    </Tap>
  );
}

// ---- Suggestion and recent rows ---------------------------------------------------------

/**
 * One line that runs a search: "Search for “fea”" (sparkle), a need that
 * matches what's typed, or a recent search (clock, with ×).
 */
export const SuggestRow = memo(function SuggestRow({
  icon,
  text,
  strong,
  sub,
  label,
  onPress,
  onRemove,
  removeLabel,
  first,
  lines = 2,
}: {
  /** "spark": the search sparkle. */
  icon: IconName | "spark";
  /** Lines for the main line (one for "Search for “…”": the field has it all). */
  lines?: number;
  /** Muted lead-in ("Search for"). */
  text?: string;
  /** The query or need, in the text colour. */
  strong: string;
  /** A second line (a need's chip name). */
  sub?: string;
  label: string;
  onPress: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  first?: boolean;
}) {
  return (
    <View style={styles.suggest}>
      {first ? null : <View style={styles.divider} />}
      <Tap
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        feedback="highlight"
        highlightColor={c.feature}
        style={styles.suggestTap}
      >
        <View style={styles.suggestIcon}>
          {icon === "spark" ? <Spark size={18} /> : <Icon name={icon} size={18} color={c.accent} />}
        </View>
        <View style={styles.suggestText}>
          <T style={styles.suggestLine} numberOfLines={lines}>
            {text ? <T style={styles.suggestLead}>{`${text} `}</T> : null}
            {strong}
          </T>
          {sub ? <T style={styles.suggestSub}>{sub}</T> : null}
        </View>
      </Tap>
      {onRemove ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={removeLabel ?? "Remove"}
          onPress={onRemove}
          feedback="highlight"
          highlightColor={c.feature}
          style={styles.remove}
        >
          <Icon name="close" size={18} color={c.muted} />
        </Tap>
      ) : null}
    </View>
  );
});

// ---- Need cloud -------------------------------------------------------------------------

/**
 * Common needs as a wrapping cloud of sand chips (the doc's Search default),
 * the way people say them. Tapping one searches it.
 */
export const NeedCloud = memo(function NeedCloud({
  needs,
  onPick,
  variant = "sand",
  label = "Common needs",
}: {
  needs: readonly Need[];
  onPick: (need: Need) => void;
  variant?: "sand" | "outline" | "surface";
  label?: string;
}) {
  return (
    <View style={styles.cloud} role="group" accessibilityLabel={label}>
      {needs.map((need) => (
        <NeedChip
          key={need.id}
          label={need.short}
          variant={variant}
          hint={`Searches “${need.label}”`}
          onPress={() => onPick(need)}
        />
      ))}
    </View>
  );
});

/** A library this size is the full one, not a part of it. */
const LIBRARY = 50;
/** Fewest sermons for a topic card in the real library. */
const MIN_TOPIC = 6;

// ---- Topic cards ------------------------------------------------------------------------

/**
 * Browse by topic: sand cards in two columns (one at large text), each with
 * the topic's name in serif and one of its sermons peeking from the corner,
 * tilted like the welcome's wall. Replaces the old Topics tab.
 */
export const TopicCards = memo(function TopicCards() {
  const go = useGo();
  const { sermons } = useCatalogue();
  const { topics } = useTopics();
  const { width, fontScale } = useWindowDimensions();
  const inner = Math.min(width, 760) - 48;
  const half = (inner - 12) / 2;
  const oneColumn = fontScale >= 1.35 || half < 140;
  // Each card peeks a different sermon where it can, its best match first.
  const cards = useMemo(() => {
    const used = new Set<string>();
    // In the whole library a topic with a handful of sermons reads as a
    // mistake: only well-filled ones show. In a smaller list (offline with
    // a few, or the phones while few sermons are on R2) any with sermons
    // shows; only the app's own sample (development and the tests) shows
    // an empty topic too.
    const min = sermons.length >= LIBRARY ? MIN_TOPIC : catalogueMode === "sample" ? 0 : 1;
    return topics
      .map((topic) => ({ topic, list: sermonsInTopic(sermons, topic.id) }))
      .filter(({ list }) => list.length >= min)
      .map(({ topic, list }) => {
        const peek = list.find((s) => !used.has(s.id)) ?? list[0];
        if (peek) used.add(peek.id);
        return { topic, count: list.length, peek };
      });
  }, [sermons, topics]);
  if (!cards.length) return null;
  return (
    <View>
      <ListHeading title="Browse by topic" />
      <View style={styles.grid}>
        {cards.map(({ topic, count, peek }) => (
          <Tap
            key={topic.id}
            accessibilityRole="button"
            accessibilityLabel={`${topic.label}, ${sermonCount(count)}`}
            accessibilityHint={topic.description}
            onPress={() => go.push(topicHref(topic.id))}
            unstable_pressDelay={60}
            feedback="scaleLarge"
            style={[styles.topic, { width: oneColumn ? inner : half }]}
          >
            {peek ? (
              <View style={styles.peek}>
                <Artwork art={peek} width={104} radius={8} lift="none" />
              </View>
            ) : null}
            <View style={styles.topicText}>
              <T style={styles.topicName} maxFontSizeMultiplier={textCap.section}>
                {topic.label}
              </T>
              <T style={styles.topicCount}>{sermonCount(count)}</T>
            </View>
          </Tap>
        ))}
      </View>
    </View>
  );
});

// ---- Calm states ------------------------------------------------------------------------

/**
 * What happened, in one serif line, why in one muted line, and one way
 * forward. No exclamation marks, no blame (the doc's states table).
 */
export function CalmState({
  icon,
  title,
  body,
  action,
  children,
  testID,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.state}>
      <View style={styles.stateIcon}>
        <Icon name={icon} size={24} color={c.accent} />
      </View>
      <Heading level={2} style={styles.stateTitle} maxFontSizeMultiplier={textCap.section}>
        {title}
      </Heading>
      <T style={styles.stateBody}>{body}</T>
      {children ? <View style={styles.stateExtra}>{children}</View> : null}
      {action ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.stateButton}
        >
          <Icon name="refresh" size={16} color={c.onAccent} />
          <T style={styles.stateButtonText} maxFontSizeMultiplier={textCap.chip}>
            {action.label}
          </T>
        </Tap>
      ) : null}
    </View>
  );
}

/** A quiet line inside the list ("No sermon titles match …"). */
export function Note({ children, icon = "information-circle-outline" }: { children: ReactNode; icon?: IconName }) {
  return (
    <View style={styles.note}>
      <Icon name={icon} size={16} color={c.muted} />
      <T style={styles.noteText}>{children}</T>
    </View>
  );
}

/** "Show 30 more" under a long list. */
export function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.more}>
      <TextButton label={label} icon="chevron-down" onPress={onPress} />
    </View>
  );
}

/**
 * The search's one live region, invisible: what the loader says search is
 * doing, then what it found (the care card's words first when it shows).
 * Read politely by screen readers as it changes. iOS announces it (VoiceOver
 * has no live regions); web and Android use a polite live region.
 */
export function LiveStatus({ text }: { text: string }) {
  if (Platform.OS === "ios") return null;
  return (
    <T testID="search-status" accessibilityLiveRegion="polite" style={styles.hidden}>
      {text}
    </T>
  );
}

const styles = StyleSheet.create({
  // The count stays on the title's first line: on a narrow phone ("Moments
  // that speak to this" at 320pt) the title wraps beside it instead.
  heading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: 12,
    paddingHorizontal: 24,
    marginTop: 22,
    marginBottom: 12,
  },
  headingTitle: { ...type.sectionSmall, color: c.text, flexShrink: 1, minWidth: 0 },
  countWrap: { marginLeft: "auto" },
  headingAction: { marginVertical: -14 },
  // The count keeps to one line; the title wraps instead.
  count: { ...type.meta, color: c.muted, flexShrink: 0, ...tabular },

  sermon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.r18,
  },
  // A hairline between rows, on the content's edges (not the press highlight's).
  divider: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: c.divider,
  },
  sermonText: { flex: 1, minWidth: 0 },
  sermonTitle: { ...type.cardTitle, color: c.text },
  sermonMeta: { ...type.meta, color: c.muted, marginTop: 3, ...tabular },
  sermonExtra: { ...type.labelSmall, color: c.accent, marginTop: 3 },

  suggest: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, borderRadius: radius.r18 },
  suggestTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.r18,
  },
  suggestIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestText: { flex: 1, minWidth: 0 },
  suggestLine: { ...type.label, color: c.text },
  suggestLead: { fontFamily: font.medium, color: c.muted },
  suggestSub: { ...type.meta, color: c.muted, marginTop: 1 },
  remove: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  cloud: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 24 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 24 },
  topic: {
    minHeight: 128,
    borderRadius: radius.r20,
    backgroundColor: c.feature,
    overflow: "hidden",
  },
  topicText: { padding: 16, paddingBottom: 44 },
  topicName: { ...type.sectionSmall, color: c.text },
  topicCount: { ...type.metaSmall, color: c.mutedOnFeature, marginTop: 6 },
  // The doc's Peek: one tile at -8°, clipped by the card's corner.
  peek: {
    position: "absolute",
    right: -16,
    bottom: -18,
    transform: [{ rotate: "-8deg" }],
    boxShadow: shadows.art,
    borderRadius: 8,
    pointerEvents: "none",
  },

  state: { marginHorizontal: 20, marginTop: 24, padding: 22, borderRadius: radius.r22, backgroundColor: c.surface, boxShadow: shadows.card },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  stateTitle: { ...type.sectionSmall, color: c.text },
  stateBody: { ...type.body, color: c.muted, marginTop: 6 },
  stateExtra: { marginTop: 14, marginHorizontal: -24 },
  stateButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    marginTop: 18,
    borderRadius: radius.pill,
    backgroundColor: c.accent,
  },
  stateButtonText: { ...type.button, color: c.onAccent },

  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 24, marginTop: 18 },
  noteText: { ...type.meta, color: c.muted, flex: 1 },
  more: { alignItems: "center", marginTop: 8 },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", left: -1, top: 0 },
});
