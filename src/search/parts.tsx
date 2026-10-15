import { memo, useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { categories, topicDisclaimer, type CategoryId } from "../data/categories";
import { eventLine, headline } from "../data/display";
import { sermonsInCategory, type Sermon } from "../data/sermons";
import { Artwork, NeedChip, spokenText } from "../kit";
import { Spark } from "../kit/Spark";
import { searchSermonMeta, type Need, type SearchSermon } from "../learning";
import { useGo } from "../navigation";
import { sermonCount } from "../topics";
import { c, font, radius, shadows, tabular, textCap, type } from "../theme";
import { Heading, Icon, SermonTitle, T, Tap, TextButton, nowrap, type IconName } from "../ui";

/**
 * The pieces of the Search tab (concept screen 02 and the design doc's
 * Search section): headings, rows, the need cloud, topic cards and the calm
 * states. Each row is one accessible element with its words composed.
 */

// ---- Section heading ----------------------------------------------------------------

/**
 * A serif section title (22/28, as concept screen 02 sets "Moments that
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
      <Heading level={2} style={styles.headingTitle} maxFontSizeMultiplier={textCap.section}>
        {title}
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
  const meta = searchSermonMeta(sermon).split(" · ").map(nowrap).join(" · ");
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

/** A library this size is the real one, not the bundled sample. */
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
  const { width, fontScale } = useWindowDimensions();
  const inner = Math.min(width, 760) - 48;
  const half = (inner - 12) / 2;
  const oneColumn = fontScale >= 1.35 || half < 140;
  // Each card peeks a different sermon where it can, newest first.
  const cards = useMemo(() => {
    const used = new Set<string>();
    // In the whole library a topic with a handful of sermons reads as a
    // mistake: only well-filled ones show (the small sample shows all).
    const min = sermons.length >= LIBRARY ? MIN_TOPIC : 0;
    return categories
      .map((category) => {
        const list = sermonsInCategory(sermons, category.id);
        return { category, list };
      })
      .filter(({ list }) => list.length >= min)
      .map(({ category, list }) => {
        const peek = list.find((s) => !used.has(s.id)) ?? list[0];
        if (peek) used.add(peek.id);
        return { category, count: list.length, peek };
      });
  }, [sermons]);
  if (!cards.length) return null;
  return (
    <View>
      <ListHeading title="Browse by topic" />
      <View style={styles.grid}>
        {cards.map(({ category, count, peek }) => (
          <Tap
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`${category.label}, ${sermonCount(count)}`}
            accessibilityHint={category.description}
            onPress={() =>
              go.push({ pathname: "/topics/[categoryId]", params: { categoryId: category.id as CategoryId } })
            }
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
                {category.label}
              </T>
              <T style={styles.topicCount}>{sermonCount(count)}</T>
            </View>
          </Tap>
        ))}
      </View>
      <View style={styles.disclaimer}>
        <Icon name="information-circle-outline" size={15} color={c.muted} />
        <T style={styles.disclaimerText}>{topicDisclaimer}</T>
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
 * Read once by screen readers when the results change; invisible. iOS
 * announces it (VoiceOver has no live regions); web and Android use a
 * polite live region.
 */
export function LiveStatus({ text }: { text: string }) {
  if (Platform.OS === "ios") return null;
  return (
    <T accessibilityLiveRegion="polite" style={styles.hidden}>
      {text}
    </T>
  );
}

const styles = StyleSheet.create({
  // On a narrow phone the count moves to its own line rather than breaking
  // the title.
  heading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: 12,
    rowGap: 2,
    paddingHorizontal: 24,
    marginTop: 22,
    marginBottom: 12,
  },
  headingTitle: { ...type.section, fontSize: 22, lineHeight: 28, color: c.text, flexShrink: 0, maxWidth: "100%" },
  countWrap: { marginLeft: "auto" },
  headingAction: { marginVertical: -14 },
  // The count keeps to one line; the title wraps instead.
  count: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: c.muted, flexShrink: 0, ...tabular },

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
  sermonMeta: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: c.muted, marginTop: 3, ...tabular },
  sermonExtra: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, color: c.accent, marginTop: 3 },

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
  suggestLine: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21, color: c.text },
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
  topicName: { fontFamily: font.serif, fontSize: 22, lineHeight: 26, letterSpacing: -0.2, color: c.text },
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
  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 24, marginTop: 14 },
  disclaimerText: { ...type.meta, color: c.muted, flex: 1 },

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
  stateTitle: { ...type.section, fontSize: 22, lineHeight: 28, color: c.text },
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
  noteText: { ...type.meta, fontSize: 13.5, lineHeight: 19, color: c.muted, flex: 1 },
  more: { alignItems: "center", marginTop: 8 },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", left: -1, top: 0 },
});
