import * as Haptics from "expo-haptics";
import { memo, useRef, useState } from "react";
import { Platform, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import { useGate } from "../auth/gate";
import type { Sermon } from "../data/sermons";
import { shareSermon } from "../share";
import { c, font, radius, tabular, textCap, type } from "../theme";
import { useToast } from "../toast";
import { Icon, T, Tap, web, type IconName } from "../ui";

/**
 * A 40pt round action on the stage's dark panel (44pt to touch), as in the
 * concept: white 10% with a faint white edge. Its name is also inside it as
 * hidden text, so it reads the same to every assistive technology.
 */
function StageRound({
  icon,
  label,
  hint,
  selected,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const toggle = selected !== undefined;
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={toggle ? { selected } : undefined}
      {...(toggle ? web({ "aria-pressed": selected }) : null)}
      onPress={onPress}
      hitSlop={2}
      style={[styles.round, selected && styles.roundOn]}
    >
      <Icon name={icon} size={18} color={c.white} />
      <T style={styles.hidden} {...web({ "aria-hidden": true })}>
        {label}
      </T>
    </Tap>
  );
}

/**
 * Save or unsave the sermon. A guest is asked for a free account first,
 * and the save happens once they have one (the gate carries it out). Builds
 * without an account service leave Save out.
 */
export const SaveButton = memo(function SaveButton({ sermon }: { sermon: Sermon }) {
  const account = useAccount();
  const gate = useGate();
  const toast = useToast();
  // One save request at a time, so a double tap can't undo itself.
  const saving = useRef(false);
  const saved = account.isSaved(sermon.id);
  if (account.mode === "unavailable") return null;
  const toggleSave = async () => {
    if (saving.current) return;
    if (!gate.require({ kind: "save", sermonId: sermon.id })) return;
    saving.current = true;
    const next = !saved;
    // With the optimistic change, so the tap and the new state land together.
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await account.setSaved(sermon.id, next);
      toast(
        next ? "Saved to your library" : "Removed from saved",
        next ? "bookmark" : "bookmark-outline",
      );
    } catch {
      toast(
        next ? "Couldn’t save. Check your connection." : "Couldn’t remove it. Check your connection.",
        "alert-circle-outline",
      );
    } finally {
      saving.current = false;
    }
  };
  return (
    <StageRound
      testID="save-sermon"
      icon={saved ? "bookmark" : "bookmark-outline"}
      label={saved ? "Saved" : "Save"}
      selected={saved}
      hint={account.user ? undefined : "Asks you to create a free account first"}
      onPress={toggleSave}
    />
  );
});

/** The system share sheet, or a copied link where a browser has none. */
export const ShareButton = memo(function ShareButton({ sermon }: { sermon: Sermon }) {
  const toast = useToast();
  // One share sheet at a time.
  const sharing = useRef(false);
  return (
    <StageRound
      testID="share-sermon"
      // Each platform's own share glyph.
      icon={Platform.OS === "android" ? "share-social-outline" : "share-outline"}
      label="Share"
      onPress={async () => {
        if (sharing.current) return;
        sharing.current = true;
        await shareSermon(sermon, toast);
        sharing.current = false;
      }}
    />
  );
});

/**
 * The stage's call to play before the player loads: a white pill that says
 * how long ("Watch · 1 hr 53 min", "Resume · 1 hr 16 min left", "Play from
 * 34:12"), filling the room beside Save and Share. On a narrow phone or at
 * large text the detail takes a second line rather than being cut off. When
 * resuming, a thin line along its foot shows how far in.
 */
export const WatchPill = memo(function WatchPill({
  label,
  detail,
  accessibilityLabel,
  hint,
  progress,
  onPress,
}: {
  label: string;
  detail?: string | null;
  accessibilityLabel: string;
  hint?: string;
  /** 0 to 1: how much has been watched (Resume). */
  progress?: number | null;
  onPress: () => void;
}) {
  const shows = progress != null && progress > 0;
  const { width, fontScale } = useWindowDimensions();
  // Two lines at large text, or when one line doesn't fit (measured: the
  // single line wraps); a new label or window tries one line again.
  const key = `${label}|${detail}|${width}|${fontScale}`;
  const [wrapped, setWrapped] = useState<string | null>(null);
  const stacked = !!detail && (fontScale >= 1.35 || wrapped === key);
  const onLine = (e: LayoutChangeEvent) => {
    const line = type.button.lineHeight * Math.min(fontScale, textCap.chip);
    if (e.nativeEvent.layout.height > line * 1.4) setWrapped(key);
  };
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={hint}
      onPress={onPress}
      style={[styles.pill, stacked && styles.pillStacked, shows && (stacked ? styles.barRoomStacked : styles.pillWithBar)]}
    >
      <Icon name="play" size={16} color={c.accent} />
      {stacked ? (
        <View style={styles.lines}>
          <T style={styles.pillText} maxFontSizeMultiplier={textCap.chip}>
            {label}
          </T>
          <T style={[styles.pillText, styles.detailLine]} maxFontSizeMultiplier={textCap.chip}>
            {detail}
          </T>
        </View>
      ) : (
        <T style={styles.pillText} maxFontSizeMultiplier={textCap.chip} onLayout={detail ? onLine : undefined}>
          {label}
          {detail ? <T style={styles.pillDetail}>{` · ${detail}`}</T> : null}
        </T>
      )}
      {shows ? (
        <View style={styles.bar} testID="progress-bar" {...web({ "aria-hidden": true })}>
          <View style={[styles.barFill, { width: `${Math.round(Math.min(1, progress!) * 1000) / 10}%` }]} />
        </View>
      ) : null}
    </Tap>
  );
});

const styles = StyleSheet.create({
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.glassOnStage,
    borderWidth: 1,
    borderColor: c.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  roundOn: { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.4)" },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: c.white,
    justifyContent: "center",
    overflow: "hidden",
  },
  pillStacked: { paddingVertical: 6, borderRadius: 26 },
  pillWithBar: { paddingBottom: 4 },
  barRoomStacked: { paddingBottom: 13 },
  lines: { flexShrink: 1 },
  detailLine: { fontFamily: font.medium, fontSize: 13, lineHeight: 16, opacity: 0.82 },
  pillText: { ...type.button, color: c.accent, flexShrink: 1, ...tabular },
  pillDetail: { fontFamily: font.medium, color: c.accent, opacity: 0.82 },
  bar: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 7,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: c.accentTrack,
    overflow: "hidden",
  },
  barFill: { height: 3, backgroundColor: c.accent },
});
