import * as Haptics from "expo-haptics";
import { memo, useRef, type ReactNode } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useAccount, useSaved } from "../../auth/AccountProvider";
import { useGate } from "../../auth/gate";
import { headline } from "../../data/display";
import type { Sermon } from "../../data/sermons";
import { ItalicTitle, Kicker } from "../../kit";
import { shareSermon } from "../../share";
import { c, font, space, tabular, textCap, type } from "../../theme";
import { useToast } from "../../toast";
import { Icon, T, Tap, spokenDuration, web, type IconName } from "../../ui";

/**
 * Keeps the last two words of a title together, so a line never ends with
 * one word alone ("Day Two / *Morning*").
 */
const keepLastTwo = (text: string) => text.replace(/ (\S+)$/, " $1");

type SermonMetaProps = {
  sermon: Sermon;
  /** "Day 2", "Teaching 3", or the sermon's date ("23 Sep 2026"). */
  kicker: string;
  /** Optional status/resume strip ("Resuming at 4:10 · Start over", search pill). */
  statusSlot?: ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  onTitleLayout?: (e: LayoutChangeEvent) => void;
};

/**
 * The ivory header section directly beneath the video:
 * - Small eyebrow label ("DAY 2" on a path, "TEACHING 3" in a series, or the date)
 * - Round Save and Share buttons on the right
 * - Sermon title in Newsreader
 * - Full length underneath
 */
export const SermonMeta = memo(function SermonMeta({
  sermon,
  kicker,
  statusSlot,
  onLayout,
  onTitleLayout,
}: SermonMetaProps) {
  return (
    <View style={styles.container} onLayout={onLayout}>
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          <Kicker tone="gold">{kicker}</Kicker>
          <ItalicTitle
            text={keepLastTwo(headline(sermon))}
            accessibilityLabel={headline(sermon)}
            italicLast
            accessibilityRole="header"
            {...web({ "aria-level": 1 })}
            onLayout={onTitleLayout}
            style={styles.title}
            maxFontSizeMultiplier={textCap.display}
          />
        </View>
        <View style={styles.actions}>
          <IvorySaveButton sermon={sermon} />
          <IvoryShareButton sermon={sermon} />
        </View>
      </View>

      <T
        style={styles.duration}
        accessibilityLabel={spokenDuration(sermon.duration)}
      >
        {sermon.duration}
      </T>

      {statusSlot ? <View style={styles.statusSlot}>{statusSlot}</View> : null}
    </View>
  );
});

function IvoryRoundAction({
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
      style={[styles.round, selected && styles.roundSelected]}
    >
      <Icon
        name={icon}
        size={18}
        color={selected ? c.accent : c.text}
      />
      <T style={styles.hidden} {...web({ "aria-hidden": true })}>
        {label}
      </T>
    </Tap>
  );
}

/**
 * Round Save button on the ivory surface below the video. Keeps the double-tap
 * lock, optimistic haptic feedback, and guest sign-up gate.
 */
const IvorySaveButton = memo(function IvorySaveButton({
  sermon,
}: {
  sermon: Sermon;
}) {
  const account = useAccount();
  const { isSaved, setSaved } = useSaved();
  const gate = useGate();
  const toast = useToast();
  const saving = useRef(false);
  const saved = isSaved(sermon.id);
  if (account.mode === "unavailable") return null;

  const toggleSave = async () => {
    if (saving.current) return;
    if (!gate.require({ kind: "save", sermonId: sermon.id })) return;
    saving.current = true;
    const next = !saved;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await setSaved(sermon.id, next);
      toast(
        next ? "Saved" : "Removed from saved",
        next ? "bookmark" : "bookmark-outline",
      );
    } catch {
      toast(
        next
          ? "Couldn’t save. Check your connection."
          : "Couldn’t remove it. Check your connection.",
        "alert-circle-outline",
      );
    } finally {
      saving.current = false;
    }
  };

  return (
    <IvoryRoundAction
      testID="save-sermon"
      icon={saved ? "bookmark" : "bookmark-outline"}
      label={saved ? "Saved" : "Save"}
      selected={saved}
      hint={account.user ? undefined : "Asks you to create a free account first"}
      onPress={toggleSave}
    />
  );
});

/** Round Share button on the ivory surface below the video. */
const IvoryShareButton = memo(function IvoryShareButton({
  sermon,
}: {
  sermon: Sermon;
}) {
  const toast = useToast();
  const sharing = useRef(false);
  return (
    <IvoryRoundAction
      testID="share-sermon"
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

const styles = StyleSheet.create({
  container: {
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...type.sermonTitle,
    color: c.text,
    marginTop: 6,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 2,
  },
  duration: {
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
    color: c.muted,
    marginTop: 6,
    ...tabular,
  },
  statusSlot: {
    minHeight: 0,
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  roundSelected: {
    backgroundColor: c.featureOnSurface,
    borderColor: c.accent,
  },
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
});
