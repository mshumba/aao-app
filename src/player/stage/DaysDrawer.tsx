import { memo, useEffect, useRef } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Kicker, RoundButton, RouteIcon, clockText } from "../../kit";
import type { Moment } from "../../learning";
import { pathWords, stateOf } from "../../paths/model";
import type { PathDayContext } from "../../sermon/PathDay";
import { c, font, radius, shadows, space, tabular, type } from "../../theme";
import { Heading, Icon, T, Tap, moveFocus, returnFocus, web } from "../../ui";

/** How long iOS gets to report the drawer gone before its row's action runs anyway. */
const DISMISS_FALLBACK_MS = 1000;

/** VoiceOver says "button" for a row; the web keeps the menu's own roles. */
const rowRole = Platform.OS === "ios" ? "button" : "menuitem";

type DaysDrawerProps = {
  visible: boolean;
  onClose: () => void;
  pathDay: PathDayContext | null;
  moments: readonly Moment[];
  /** The sermon's headline, the heading when it has no path or moments. */
  sermonTitle: string;
  seriesName?: string | null;
  onSelectDay?: (dayNumber: number, sermonId: string) => void;
  onOpenPath?: (pathId: string) => void;
  onOpenSeries?: () => void;
  onSelectMoment?: (atSeconds: number) => void;
  onOpenYouTube?: () => void;
  onShowAbout?: () => void;
};

/**
 * Sheet opened by the top-right button in LightHeader:
 * - On a path/series sermon: this day and the next (with done / today /
 *   upcoming status), how many are done, and a link to the full path page
 *   for the rest (the owner: see your day and the next).
 * - On a standalone sermon: the sermon's key moments to jump straight to.
 * Also keeps "Go to <series>", "Open in YouTube", and "About this sermon" reachable.
 */
export const DaysDrawer = memo(function DaysDrawer({
  visible,
  onClose,
  pathDay,
  moments,
  sermonTitle,
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
  // A row's action waiting for the drawer to finish closing (iOS).
  const pending = useRef<(() => void) | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runPending = () => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    const run = pending.current;
    pending.current = null;
    run?.();
  };
  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
    },
    [],
  );

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

  // iOS drops a sheet presented while this one is still fading out (a
  // locked day's), so there a row's action waits for onDismiss. Web and
  // Android present nothing natively, so it runs at once.
  const closeThen = (action: () => void) => {
    handleClose();
    if (Platform.OS !== "ios") return action();
    pending.current = action;
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = setTimeout(runPending, DISMISS_FALLBACK_MS);
  };

  const words = pathDay ? pathWords(pathDay.path) : null;
  const hasMoments = moments.length > 0;
  const heading = pathDay ? pathDay.path.name : hasMoments ? "Moments in this sermon" : sermonTitle;
  const eyebrow = pathDay && words
    ? `${words.unit} ${pathDay.day.day} of ${pathDay.total}`
    : hasMoments
      ? `${moments.length} moment${moments.length === 1 ? "" : "s"}`
      : null;

  // This day and the next; every other day is on the path's own page.
  const todayNum = pathDay ? (pathDay.enrolled ? pathDay.today : pathDay.total ? 1 : null) : null;
  const shownDays = pathDay
    ? pathDay.days.filter((d) => d.day === pathDay.day.day || d.day === pathDay.day.day + 1)
    : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      onDismiss={runPending}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Closes on a tap outside the sheet. Hidden from assistive tech:
            VoiceOver would activate it by tapping its centre, which the
            sheet covers. Close, Escape and Back close it instead. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessible={false}
          focusable={false}
          importantForAccessibility="no"
          {...web({ "aria-hidden": true, tabIndex: -1 })}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(space.xl, insets.bottom + space.md) }]}
          accessibilityViewIsModal
          accessibilityRole="menu"
          accessibilityLabel={heading}
          testID="stage-days-drawer"
        >
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              {eyebrow ? <Kicker tone="gold">{eyebrow}</Kicker> : null}
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
                {shownDays.map((d) => {
                  const isCurrent = d.day === pathDay.day.day;
                  const state = stateOf(d.day, pathDay.done, todayNum);
                  const isDone = state === "done";
                  const locked = !isCurrent && state === "upcoming";
                  const unit = words.unit;
                  const where = isCurrent
                    ? `this ${unit.toLowerCase()}${isDone ? ", done" : ""}`
                    : isDone
                      ? "done"
                      : locked
                        ? `opens after ${unit} ${d.day - 1}`
                        : "today";
                  return (
                    <Tap
                      key={d.day}
                      accessibilityRole={rowRole}
                      accessibilityLabel={`${unit} ${d.day} of ${pathDay.total}, ${where}. ${d.theme}`}
                      onPress={() => {
                        if (isCurrent) return handleClose();
                        closeThen(() => onSelectDay?.(d.day, d.youtubeId));
                      }}
                      feedback="highlight"
                      highlightColor={c.feature}
                      style={[styles.dayItem, isCurrent && styles.dayItemCurrent]}
                      testID="stage-drawer-day"
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
                          {`${unit} ${d.day}${isCurrent ? " · Current" : isDone ? " · Done" : locked ? "" : " · Today"}`}
                        </T>
                        <T style={styles.dayTheme} numberOfLines={2}>
                          {d.theme}
                        </T>
                      </View>
                      <Icon
                        name={locked ? "lock-closed-outline" : "chevron-forward"}
                        size={locked ? 16 : 18}
                        color={isCurrent ? c.accent : c.muted}
                      />
                    </Tap>
                  );
                })}
                <T style={styles.doneLine} testID="stage-drawer-done">
                  {`${pathDay.done.length} of ${words.count(pathDay.total)} done`}
                </T>
              </View>
            ) : hasMoments ? (
              <View style={styles.daysList}>
                {moments.map((m) => (
                  <Tap
                    key={m.id}
                    accessibilityRole={rowRole}
                    accessibilityLabel={`${clockText(m.at)}: ${m.title}`}
                    onPress={() => closeThen(() => onSelectMoment?.(m.at))}
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
            ) : null}

            <View style={[styles.footerLinks, !pathDay && !hasMoments && styles.footerOnly]}>
              {pathDay && onOpenPath ? (
                <Tap
                  accessibilityRole={rowRole}
                  accessibilityLabel={`Go to ${pathDay.path.name}`}
                  onPress={() => closeThen(() => onOpenPath(pathDay.path.id))}
                  feedback="highlight"
                  highlightColor={c.feature}
                  style={styles.footerItem}
                >
                  <RouteIcon size={20} color={c.accent} />
                  <T style={styles.footerItemText}>{`Go to ${pathDay.path.name}`}</T>
                </Tap>
              ) : !pathDay && seriesName && onOpenSeries ? (
                <Tap
                  accessibilityRole={rowRole}
                  accessibilityLabel={`Go to ${seriesName}`}
                  onPress={() => closeThen(onOpenSeries)}
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
                  accessibilityRole={rowRole}
                  accessibilityLabel="Open in YouTube"
                  onPress={() => closeThen(onOpenYouTube)}
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
                  accessibilityRole={rowRole}
                  accessibilityLabel="About this sermon"
                  onPress={() => closeThen(onShowAbout)}
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
  doneLine: {
    ...type.metaSmall,
    color: c.muted,
    paddingHorizontal: 12,
    marginTop: space.xs,
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
  // Straight under the heading's own rule: no second one.
  footerOnly: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
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
