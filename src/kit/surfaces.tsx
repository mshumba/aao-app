import { Children, Fragment, cloneElement, isValidElement, memo, type ReactElement, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { c, font, radius, shadows, space, textCap, type } from "../theme";
import { Heading, Icon, T, Tap, type IconName } from "../ui";

// ---- Card ----------------------------------------------------------------------------

export type CardTone = "surface" | "sand";

/**
 * The concept's two card grounds. "surface": white, radius 22, lifted by a
 * hairline and a soft shadow (search results, state panels, settings).
 * "sand": flat, radius 20, no edge (a guest's invitation, topic and series
 * cards). Never a frame round artwork.
 */
export const Card = memo(function Card({
  tone = "surface",
  children,
  style,
  testID,
}: {
  tone?: CardTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.card, tone === "sand" ? styles.sand : styles.surface, style]}>
      {children}
    </View>
  );
});

// ---- Grouped rows -------------------------------------------------------------------

/**
 * Rows that share one white card (Account's settings), under an optional
 * quiet label. Hairlines between rows start at the text, not the icon.
 */
export const ListGroup = memo(function ListGroup({
  title,
  note,
  children,
  style,
}: {
  /** Sentence case, muted ("Your account"). */
  title?: string;
  /** A plain-language line under the group. */
  note?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<EdgeProps>[];
  return (
    <View style={[styles.group, style]}>
      {title ? (
        <Heading level={2} style={styles.groupTitle} maxFontSizeMultiplier={textCap.section}>
          {title}
        </Heading>
      ) : null}
      <View style={styles.list}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {cloneElement(row, { first: index === 0, last: index === rows.length - 1 })}
          </Fragment>
        ))}
      </View>
      {note ? <T style={styles.groupNote}>{note}</T> : null}
    </View>
  );
});

/** Set by ListGroup: the first and last rows take the card's corners. */
type EdgeProps = { first?: boolean; last?: boolean };

/**
 * One setting or destination: a sand icon well, the label, its current
 * value under it (read with it), and a chevron. 52pt for one line, about
 * 60pt with a value; grows with the text. `danger` draws the label and icon
 * in the error colour, without a well (Delete account).
 */
export const ListRow = memo(function ListRow({
  icon,
  title,
  value,
  onPress,
  hint,
  danger = false,
  testID,
  first = true,
  last = true,
}: EdgeProps & {
  icon: IconName;
  title: string;
  value?: string | null;
  onPress: () => void;
  hint?: string;
  danger?: boolean;
  testID?: string;
}) {
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={hint}
      onPress={onPress}
      feedback="highlight"
      highlightColor={c.featureOnSurface}
      style={[styles.row, first && styles.first, last && styles.last]}
    >
      <View style={[styles.well, danger && styles.wellDanger]}>
        <Icon name={icon} size={18} color={danger ? c.error : c.accent} />
      </View>
      <View style={styles.rowText}>
        <T style={[styles.rowTitle, danger && { color: c.error }]}>{title}</T>
        {value ? <T style={styles.rowValue}>{value}</T> : null}
      </View>
      <Icon name="chevron-forward" size={18} color={c.muted} />
    </Tap>
  );
});

const styles = StyleSheet.create({
  card: { padding: space.s20 },
  surface: {
    backgroundColor: c.surface,
    borderRadius: radius.r22,
    boxShadow: shadows.card,
  },
  sand: { backgroundColor: c.feature, borderRadius: radius.r20 },
  group: { gap: space.sm },
  groupTitle: {
    fontFamily: font.semibold,
    fontSize: type.caption.fontSize,
    lineHeight: 18,
    color: c.muted,
    paddingHorizontal: 4,
  },
  groupNote: { ...type.caption, color: c.muted, paddingHorizontal: 4 },
  // No clipping, so a row's web focus ring stays visible; each row carries
  // the card's corners instead.
  list: {
    backgroundColor: c.surface,
    borderRadius: radius.r22,
    boxShadow: shadows.card,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: c.divider,
    marginStart: 16 + 30 + 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  first: { borderTopLeftRadius: radius.r22, borderTopRightRadius: radius.r22 },
  last: { borderBottomLeftRadius: radius.r22, borderBottomRightRadius: radius.r22 },
  well: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  wellDanger: { backgroundColor: "transparent" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...type.label, color: c.text },
  rowValue: { ...type.meta, color: c.muted },
});
