import { memo, useEffect, useRef } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { CardFan, Kicker, type ArtSource } from "../kit";
import { c, radius, shadows, space, type } from "../theme";
import { Icon, T, Tap, moveFocus, nowrap, type IconName } from "../ui";
import { RouteIcon } from "../kit/RouteIcon";

/** `icon: "route"`: the Paths tab's own glyph. */
export type MenuItem = { key: string; label: string; icon: IconName | "route"; onPress: () => void };

/**
 * The stage's "…": a small menu under the button (Open in YouTube, the
 * path, About this sermon). A tap outside, Escape or Back closes it.
 */
export const MoreMenu = memo(function MoreMenu({
  visible,
  onClose,
  items,
  top,
  right,
}: {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
  top: number;
  right: number;
}) {
  const first = useRef<View>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => moveFocus(first.current), 50);
    // Web: Escape closes it wherever focus is, even before focus moves in.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    if (Platform.OS === "web") document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      if (Platform.OS === "web") document.removeEventListener("keydown", onKey);
    };
  }, [visible]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => moveFocus(first.current)}
      statusBarTranslucent
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View style={[styles.menu, { top, right }]} accessibilityRole="menu" accessibilityLabel="More options">
        {items.map((item, i) => (
          <Tap
            key={item.key}
            ref={i === 0 ? first : undefined}
            accessibilityRole="menuitem"
            accessibilityLabel={item.label}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            feedback="highlight"
            highlightColor={c.feature}
            style={styles.item}
          >
            {item.icon === "route" ? (
              <RouteIcon size={20} color={c.accent} />
            ) : (
              <Icon name={item.icon} size={20} color={c.accent} />
            )}
            <T style={styles.label}>{item.label}</T>
          </Tap>
        ))}
      </View>
    </Modal>
  );
});

/**
 * "Part of Apostolic Shift" on the panel when the sermon isn't a path day:
 * the series' artwork as a small fan, which part this is, and a way to the
 * whole series. The kit's PartOfPathRow, without path progress.
 */
export const SeriesRow = memo(function SeriesRow({
  name,
  part,
  total,
  fan,
  onPress,
}: {
  name: string;
  part: number | null;
  total: number;
  fan: ArtSource[];
  onPress: () => void;
}) {
  // "2 of 3" never breaks inside.
  const kicker = part
    ? `Part of a series · ${nowrap(`${part} of ${total}`)}`
    : `Part of a series · ${nowrap(`${total} messages`)}`;
  return (
    <Tap
      testID="part-of-series"
      accessibilityRole="button"
      accessibilityLabel={`${kicker.replace(" · ", ". ").replace(/\u00A0/g, " ")}. ${name}.`}
      accessibilityHint="Opens every part of the series"
      onPress={onPress}
      feedback="scaleLarge"
      style={styles.row}
    >
      <CardFan sermons={fan} size="row" />
      <View style={styles.rowText}>
        <Kicker tone="onFeature">{kicker}</Kicker>
        <T style={styles.rowName} numberOfLines={2}>
          {name}
        </T>
      </View>
      <Icon name="chevron-forward" size={20} color={c.mutedOnFeature} />
    </Tap>
  );
});

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    minWidth: 232,
    maxWidth: 300,
    padding: 6,
    borderRadius: radius.lg,
    backgroundColor: c.raised,
    boxShadow: shadows.floating,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  label: { ...type.label, color: c.text, flexShrink: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.feature,
    borderRadius: radius.r20,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { ...type.cardTitle, color: c.text, marginTop: 2 },
});
