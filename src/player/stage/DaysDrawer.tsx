import { memo, useEffect, useRef } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Kicker, RoundButton, RouteIcon, clockText } from "../../kit";
import type { Moment } from "../../learning";
import { pathWords } from "../../paths/model";
import type { PathDayContext } from "../../sermon/PathDay";
import { c, font, radius, shadows, space, tabular, type } from "../../theme";
import { Heading, Icon, T, Tap, moveFocus, returnFocus } from "../../ui";

export type DaysDrawerProps = {
  visible: boolean;
  onClose: () => void;
  pathDay: PathDayContext | null;
  moments: readonly Moment[];
  seriesName?: string | null;
  onSelectDay?: (dayNumber: number, sermonId: string) => void;
  onOpenPath?: (pathId: string) => void;
  onOpenSeries?: () => void;
  onSelectMoment?: (atSeconds: number) => void;
  onOpenYouTube?: () => void;
  onShowAbout?: () => void;
};

/**
 * Sheet opened by the top-right playlist button in LightHeader:
 * - On a path/series sermon: lists the path's days (with Done / Today / Upcoming
 *   status) and a link to the full path page.
 * - On a standalone sermon: lists the sermon's key moments to jump straight to.
 * Also keeps "Go to <series>", "Open in YouTube", and "About this sermon" reachable.
 */
export const DaysDrawer = memo(function DaysDrawer({
  visible,
  onClose,
  pathDay,
  moments,
  seriesName,
  onSelectDay,
  onOpenPath,
  onOpenSeries,
  onSelectMoment,
  onOpenYouTube,
  onShowAbout,
}: DaysDrawerProps) {
  const insets = useSafeAreaInsets();
  const closeRef = useRef<View>(null);
  const triggerRef = useRef<Element | null>(null);
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      triggerRef.current = document.activeElement;
    }
    const timer = setTimeout(() => moveFocus(closeRef.current), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        latestClose.current();
        returnFocus(triggerRef.current);
      }
    };
    if (Platform.OS === "web") document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      if (Platform.OS === "web") document.removeEventListener("keydown", onKey);
    };
  }, [visible]);

  const handleClose = () => {
    onClose();
    returnFocus(triggerRef.current);
  };

  const words = pathDay ? pathWords(pathDay.path) : null;
  const heading = pathDay
    ? pathDay.path.name
    : "Moments in this sermon";
  const eyebrow = pathDay && words
    ? `${words.unit} ${pathDay.day.day} of ${pathDay.total}`
    : `${moments.length} moment${moments.length === 1 ? "" : "s"}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close drawer"
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(space.xl, insets.bottom + space.md) }]}
          accessibilityRole="menu"
          accessibilityLabel={heading}
          testID="stage-days-drawer"
        >
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Kicker tone="gold">{eyebrow}</Kicker>
              <Heading level={2} style={styles.sheetTitle} numberOfLines={2}>
                {heading}
              </Heading>
            </View>
            <View ref={closeRef} collapsable={false}>
              <RoundButton
                tone="surface"
                size={36}
                icon="close"
                iconSize={18}
                label="Close"
                onPress={handleClose}
              />
            </View>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {pathDay && words ? (
              <View style={styles.daysList}>
                {pathDay.days.map((d) => {
                  const isDone = pathDay.done.includes(d.day);
                  const isCurrent = d.day === pathDay.day.day;
                  return (
                    <Tap
                      key={d.day}
                      accessibilityRole="menuitem"
                      accessibilityLabel={`${words.unit} ${d.day}: ${d.theme}${isCurrent ? ", playing now" : isDone ? ", completed" : ""}`}
                      onPress={() => {
                        handleClose();
                        if (!isCurrent) onSelectDay?.(d.day, d.youtubeId);
                      }}
                      feedback="highlight"
                      highlightColor={c.feature}
                      style={[styles.dayItem, isCurrent && styles.dayItemCurrent]}
                    >
                      <View
                        style={[
                          styles.dayBadge,
                          isDone && styles.dayBadgeDone,
                          isCurrent && styles.dayBadgeCurrent,
                        ]}
                      >
                        {isDone ? (
                          <Icon name="checkmark" size={14} color={c.onAccent} />
                        ) : (
                          <T
                            style={[
                              styles.dayNumber,
                              isCurrent && { color: c.onAccent },
                            ]}
                          >
                            {String(d.day)}
                          </T>
                        )}
                      </View>
                      <View style={styles.dayTextCol}>
                        <T style={styles.dayUnit}>
                          {`${words.unit} ${d.day}${isCurrent ? " · Current" : ""}`}
                        </T>
                        <T style={styles.dayTheme} numberOfLines={2}>
                          {d.theme}
                        </T>
                      </View>
                      <Icon
                        name="chevron-forward"
                        size={18}
                        color={isCurrent ? c.accent : c.muted}
                      />
                    </Tap>
                  );
                })}
              </View>
            ) : (
              <View style={styles.daysList}>
                {moments.map((m) => (
                  <Tap
                    key={m.id}
                    accessibilityRole="menuitem"
                    accessibilityLabel={`${clockText(m.at)}: ${m.title}`}
                    onPress={() => {
                      handleClose();
                      onSelectMoment?.(m.at);
                    }}
                    feedback="highlight"
                    highlightColor={c.feature}
                    style={styles.dayItem}
                  >
                    <View style={styles.momentStamp}>
                      <T style={styles.momentStampText}>{clockText(m.at)}</T>
                    </View>
                    <View style={styles.dayTextCol}>
                      <T style={styles.dayTheme} numberOfLines={2}>
                        {m.title}
                      </T>
                    </View>
                  </Tap>
                ))}
              </View>
            )}

            <View style={styles.footerLinks}>
              {pathDay && onOpenPath ? (
                <Tap
                  accessibilityRole="menuitem"
                  accessibilityLabel={`Go to ${pathDay.path.name}`}
                  onPress={() => {
                    handleClose();
                    onOpenPath(pathDay.path.id);
                  }}
                  feedback="highlight"
                  highlightColor={c.feature}
                  style={styles.footerItem}
                >
                  <RouteIcon size={20} color={c.accent} />
                  <T style={styles.footerItemText}>{`Go to ${pathDay.path.name}`}</T>
                </Tap>
              ) : !pathDay && seriesName && onOpenSeries ? (
                <Tap
                  accessibilityRole="menuitem"
                  accessibilityLabel={`Go to ${seriesName}`}
                  onPress={() => {
                    handleClose();
                    onOpenSeries();
                  }}
                  feedback="highlight"
                  highlightColor={c.feature}
                  style={styles.footerItem}
                >
                  <Icon name="albums-outline" size={20} color={c.accent} />
                  <T style={styles.footerItemText}>{`Go to ${seriesName}`}</T>
                </Tap>
              ) : null}
              {onOpenYouTube ? (
                <Tap
                  accessibilityRole="menuitem"
                  accessibilityLabel="Open in YouTube"
                  onPress={() => {
                    handleClose();
                    onOpenYouTube();
                  }}
                  feedback="highlight"
                  highlightColor={c.feature}
                  style={styles.footerItem}
                >
                  <Icon name="logo-youtube" size={20} color={c.accent} />
                  <T style={styles.footerItemText}>Open in YouTube</T>
                </Tap>
              ) : null}
              {onShowAbout ? (
                <Tap
                  accessibilityRole="menuitem"
                  accessibilityLabel="About this sermon"
                  onPress={() => {
                    handleClose();
                    onShowAbout();
                  }}
                  feedback="highlight"
                  highlightColor={c.feature}
                  style={styles.footerItem}
                >
                  <Icon name="information-circle-outline" size={20} color={c.accent} />
                  <T style={styles.footerItemText}>About this sermon</T>
                </Tap>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 17, 21, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.r28,
    borderTopRightRadius: radius.r28,
    paddingTop: space.lg,
    paddingHorizontal: space.s20,
    boxShadow: shadows.floating,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  sheetHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    ...type.sectionSmall,
    color: c.text,
    marginTop: 2,
  },
  list: {
    marginTop: space.sm,
  },
  daysList: {
    gap: 6,
    paddingVertical: space.xs,
  },
  dayItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
  },
  dayItemCurrent: {
    backgroundColor: c.surface,
    boxShadow: shadows.card,
  },
  dayBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.nodeRing,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadgeDone: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  dayBadgeCurrent: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  dayNumber: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15,
    color: c.muted,
    ...tabular,
  },
  dayTextCol: {
    flex: 1,
    minWidth: 0,
  },
  dayUnit: {
    ...type.metaSmall,
    color: c.muted,
  },
  dayTheme: {
    ...type.cardTitle,
    color: c.text,
    marginTop: 1,
  },
  momentStamp: {
    minWidth: 64,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: c.feature,
    alignItems: "center",
  },
  momentStampText: {
    ...type.labelSmall,
    color: c.accent,
    ...tabular,
  },
  footerLinks: {
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: c.border,
    gap: 4,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  footerItemText: {
    ...type.label,
    color: c.text,
  },
});
