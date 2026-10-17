import { memo, type ReactNode, type Ref } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { c, radius, textCap, type } from "../theme";
import { Icon, T, Tap, type IconName, type WebKey } from "../ui";

export type ChipVariant = "sand" | "outline" | "navy" | "surface";

/**
 * A need, phrased the way a person would say it ("The same sin again").
 * 36pt drawn, 44pt to touch. Sand on ivory; "outline" for related needs
 * under the search field; "navy" when selected; "surface" on white cards.
 */
export const NeedChip = memo(function NeedChip({
  label,
  onPress,
  variant = "sand",
  icon,
  selected,
  hint,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ChipVariant;
  icon?: IconName;
  /** Marks it selected for assistive tech (and draws it navy). */
  selected?: boolean;
  hint?: string;
  testID?: string;
}) {
  const v = selected ? "navy" : variant;
  const fg = v === "navy" ? c.onAccent : c.text;
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint ?? "Searches for this"}
      aria-selected={selected}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[styles.chip, chipStyles[v]]}
    >
      {icon ? <Icon name={icon} size={16} color={v === "navy" ? c.onAccent : c.accent} /> : null}
      <T style={[styles.label, { color: fg }]} numberOfLines={1} maxFontSizeMultiplier={textCap.chip}>
        {label}
      </T>
    </Tap>
  );
});

/**
 * A filter: one of a group of choices (role "radio", navy when chosen, a
 * check in place of its icon so choosing never shifts the row), or a
 * control that shows a group ("button" with `expanded`). 36pt drawn, 44pt
 * to touch. Spread useRadioKeys' props for a radio group's keyboard.
 */
export const FilterChip = memo(function FilterChip({
  label,
  onPress,
  selected = false,
  role = "radio",
  expanded,
  icon,
  hint,
  testID,
  ref,
  onWebKey,
  ...rest
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  role?: "radio" | "button";
  /** For a "button" that shows or hides a group of choices. */
  expanded?: boolean;
  icon?: IconName;
  hint?: string;
  testID?: string;
  ref?: Ref<View>;
  onWebKey?: (e: WebKey) => void;
  /** Web: one Tab stop per radio group (from useRadioKeys). */
  tabIndex?: 0 | -1;
}) {
  const on = selected;
  const glyph: IconName | undefined =
    role === "radio" ? (on ? "checkmark" : icon) : expanded ? "chevron-up" : "chevron-down";
  return (
    <Tap
      ref={ref}
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-checked={role === "radio" ? on : undefined}
      aria-expanded={role === "button" ? !!expanded : undefined}
      aria-selected={role === "button" ? on : undefined}
      onWebKey={onWebKey}
      {...rest}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[styles.chip, on ? chipStyles.navy : chipStyles.outline, !on && styles.filterIdle]}
    >
      <T
        style={[styles.label, { color: on ? c.onAccent : c.text }]}
        numberOfLines={1}
        maxFontSizeMultiplier={textCap.chip}
      >
        {label}
      </T>
      {glyph ? <Icon name={glyph} size={16} color={on ? c.onAccent : c.accent} /> : null}
    </Tap>
  );
});

const chipStyles = StyleSheet.create({
  sand: { backgroundColor: c.feature },
  surface: { backgroundColor: c.featureOnSurface },
  navy: { backgroundColor: c.accent },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.border },
});

/**
 * A single horizontal row of chips that scrolls, inset 24 so the first
 * chip lines up with the page and the last can scroll clear of the edge.
 */
export const ChipRow = memo(function ChipRow({
  children,
  inset = 24,
  gap = 8,
  label,
  style,
}: {
  children: ReactNode;
  inset?: number;
  gap?: number;
  /** Names the group for screen readers ("Common needs"). */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    // Above what follows, so the chips' touch areas that reach past the row
    // aren't covered by the next section.
    <View style={[styles.row, style]} accessibilityLabel={label} accessibilityRole={label ? "list" : undefined}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // 4pt of room above and below inside the scroller, taken back
        // outside it, so a chip's 44pt touch area isn't clipped.
        style={styles.rowScroller}
        contentContainerStyle={{ paddingHorizontal: inset, paddingVertical: 4, gap, alignItems: "center" }}
      >
        {children}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: { ...type.chip },
  filterIdle: { backgroundColor: c.surface },
  row: { zIndex: 1 },
  rowScroller: { marginVertical: -4 },
});
