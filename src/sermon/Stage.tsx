import { useIsFocused } from "expo-router";
import { memo, useEffect, useRef, useState, type Ref } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { headline } from "../data/display";
import type { Sermon } from "../data/sermons";
import { Artwork, RoundButton, clockText, leftText, spokenTime } from "../kit";
import { STAGE_BAR, bumpStageFocusToggle, type StageMarks } from "../player/layout";
import { clock, usePlayerSession } from "../player/PlayerProvider";
import { CcBadge, FullscreenIcon, Skip15Icon } from "../player/stage/icons";
import { canRetry, canWatchOnYouTube, playerError } from "../player/types";
import { useGo } from "../navigation";
import { c, easeOut, font, radius, shadows, space, tabular, textCap, type } from "../theme";
import { Icon, T, Tap, gradient, moveFocus, web, type IconName } from "../ui";

const TOP_SCRIM =
  "linear-gradient(180deg, rgba(15, 17, 21, 0.62) 0%, rgba(15, 17, 21, 0.2) 55%, rgba(15, 17, 21, 0) 100%)";
const BOTTOM_SCRIM =
  "linear-gradient(0deg, rgba(15, 17, 21, 0.78) 0%, rgba(15, 17, 21, 0.34) 60%, rgba(15, 17, 21, 0) 100%)";

/**
 * The stage's top bar (kept for backwards compatibility).
 */
export const StageBar = memo(function StageBar({
  width,
  skipToPlayer,
  onMore,
  moreRef,
  title,
  titleShown = false,
}: {
  width: number;
  skipToPlayer: boolean;
  onMore: () => void;
  moreRef?: Ref<View>;
  title?: string;
  titleShown?: boolean;
}) {
  const go = useGo();
  return (
    <View style={[styles.bar, { width }]} {...web({ dataSet: { dark: "true" } })}>
      <RoundButton tone="glass" size={40} icon="chevron-down" iconSize={20} label="Back" onPress={go.back} />
      {skipToPlayer && Platform.OS === "web" ? <SkipToPlayer /> : null}
      <View style={styles.barTitleSlot} accessible={false} importantForAccessibility="no-hide-descendants">
        {title ? (
          <Animated.View
            style={{
              alignSelf: "stretch",
              opacity: titleShown ? 1 : 0,
              transitionProperty: "opacity",
              transitionDuration: 200,
              transitionTimingFunction: easeOut,
            }}
          >
            <T style={styles.barTitle} numberOfLines={1} aria-hidden maxFontSizeMultiplier={1.2}>
              {title}
            </T>
          </Animated.View>
        ) : null}
      </View>
      <View ref={moreRef} collapsable={false}>
        <RoundButton
          tone="glass"
          size={40}
          icon="ellipsis-horizontal"
          iconSize={18}
          label="More options"
          onPress={onMore}
        />
      </View>
    </View>
  );
});

function SkipToPlayer() {
  const { focusPlayer } = usePlayerSession();
  const [focused, setFocused] = useState(false);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Go to video player"
      onPress={focusPlayer}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      feedback="dim"
      style={[styles.skipLink, !focused && styles.offscreen]}
    >
      <T style={styles.skipLinkText}>Go to video player</T>
    </Tap>
  );
}

/**
 * The sermon's 16:9 poster before the player loads, with the Mindvalley-style
 * video overlay controls: top-right CC, centre -15 / 64pt white Play disc / +15,
 * and bottom scrubber rail with gold moment dots, progress fill, speed pill,
 * and fullscreen icon. Serves as the single accessible call to play
 * ("Watch sermon", "Resume at 4:10", or "Play from 1 hour 8 minutes 40 seconds").
 */
export const Poster = memo(function Poster({
  sermon,
  width,
  height,
  radius: corner,
  startAt = null,
  resumeAt = 0,
  watched = 0,
  left = 0,
  guest = false,
  marks,
  onPress,
}: {
  sermon: Sermon;
  width: number;
  height: number;
  radius: number;
  startAt?: number | null;
  resumeAt?: number;
  watched?: number;
  left?: number;
  guest?: boolean;
  marks?: StageMarks;
  onPress: () => void;
}) {
  const artWidth = Math.max(width, Math.round((height * 16) / 9));
  const ask = guest ? "Asks you to create a free account first" : undefined;

  let accessibilityLabel = "Watch sermon";
  let accessibilityHint = ask ?? "Starts the sermon in the YouTube player";
  let badgeText: string | null = null;

  if (startAt != null) {
    accessibilityLabel = `Play from ${spokenTime(startAt)}`;
    accessibilityHint = ask ?? `Starts the sermon at ${spokenTime(startAt)}`;
    badgeText = `Play from ${clockText(startAt)}`;
  } else if (resumeAt > 0) {
    accessibilityLabel = `Resume at ${clock(resumeAt)}`;
    accessibilityHint = ask ?? "Plays the sermon from where you left off";
    badgeText = left > 0 ? `Resume · ${leftText(left)}` : "Resume";
  }

  const total = marks?.estimate || 0;
  const fillFraction =
    startAt != null && total > 0
      ? Math.min(1, Math.max(0, startAt / total))
      : watched > 0
        ? Math.min(1, Math.max(0, watched))
        : 0;
  const momentCount = marks?.moments.length ?? 0;
  const remainingAtStart = startAt != null && total > startAt ? total - startAt : null;

  return (
    <View
      style={{ width, height, borderRadius: corner, overflow: "hidden", backgroundColor: c.media }}
      {...web({ dataSet: { dark: "true" } })}
    >
      <View
        style={StyleSheet.absoluteFill}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        {...web({ "aria-hidden": true, pointerEvents: "none" })}
      >
        <Artwork
          art={sermon}
          width={artWidth}
          radius={corner}
          lift="none"
          priority="high"
          fallback={headline(sermon)}
          style={{ width: artWidth, height, marginLeft: (width - artWidth) / 2 }}
        />
        <View style={[styles.topScrim, gradient(TOP_SCRIM)]} />
        <View style={[styles.bottomScrim, gradient(BOTTOM_SCRIM)]} />

        {/* Top-right CC preview badge */}
        <View style={styles.topRow}>
          <View style={{ flex: 1 }} />
          <View style={styles.ccSlot}>
            <CcBadge active={false} />
          </View>
        </View>
      </View>

      {/* Primary accessible play button covering the stage */}
      <Tap
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        feedback="scale"
        style={styles.posterButton}
      >
        {/* Centre -15 / 64pt white Play disc / +15 */}
        <View
          style={styles.centerRow}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          {...web({ "aria-hidden": true })}
        >
          <View style={styles.skipPreview}>
            <Skip15Icon direction="back" size={34} color={c.white} />
          </View>
          <View style={styles.playDisc}>
            <View style={{ transform: [{ translateX: 2 }] }}>
              <Icon name="play" size={28} color={c.media} />
            </View>
          </View>
          <View style={styles.skipPreview}>
            <Skip15Icon direction="forward" size={34} color={c.white} />
          </View>
        </View>

        {badgeText ? (
          <View style={styles.badgePill}>
            <T style={styles.badgeText} maxFontSizeMultiplier={textCap.chip}>
              {badgeText}
            </T>
          </View>
        ) : null}

        {/* Bottom scrubber preview rail + progress-bar when resuming */}
        <View style={styles.bottomArea}>
          {startAt != null ? (
            <View
              style={styles.timesPreviewRow}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              {...web({ "aria-hidden": true })}
            >
              <T style={styles.previewTimeText}>{clockText(startAt)}</T>
              {momentCount > 0 ? (
                <T style={styles.markedCaption}>
                  {`${momentCount} moment${momentCount === 1 ? "" : "s"} marked`}
                </T>
              ) : null}
              {remainingAtStart != null ? (
                <T style={styles.previewTimeText}>{`−${clockText(remainingAtStart)}`}</T>
              ) : null}
            </View>
          ) : momentCount > 0 ? (
            <View
              style={styles.timesPreviewRow}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              {...web({ "aria-hidden": true })}
            >
              <View />
              <T style={styles.markedCaption}>
                {`${momentCount} moment${momentCount === 1 ? "" : "s"} marked`}
              </T>
              <View />
            </View>
          ) : null}

          <View
            style={styles.bottomBar}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            {...web({ "aria-hidden": true })}
          >
            <View
              testID={resumeAt > 0 ? "progress-bar" : undefined}
              style={styles.previewRail}
            >
              <View
                style={[
                  styles.previewFill,
                  { width: `${Math.round(fillFraction * 100)}%` },
                ]}
              />
              {total > 0 &&
                marks?.moments.map((m) => {
                  const f = Math.min(1, Math.max(0, m.at / total));
                  return (
                    <View
                      key={m.key}
                      style={[
                        styles.previewDot,
                        { left: `${Math.round(f * 1000) / 10}%` },
                      ]}
                    />
                  );
                })}
              {fillFraction > 0 ? (
                <View
                  style={[
                    styles.previewThumb,
                    { left: `${Math.round(fillFraction * 1000) / 10}%` },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.speedPillPreview}>
              <T style={styles.speedTextPreview}>1x</T>
            </View>
            <View style={styles.fullscreenPreview}>
              <FullscreenIcon size={18} color={c.white} />
            </View>
          </View>
        </View>
      </Tap>
    </View>
  );
});

/**
 * A failed player, shown on the stage where the video was: what happened
 * and what can still be done. Only actions that can work are offered. It
 * grows with the text, since it scrolls with the page.
 */
export function ErrorSlot({ width, height }: { width: number; height: number }) {
  const session = usePlayerSession();
  const focused = useIsFocused();
  const primary = useRef<View>(null);
  const message = useRef<View>(null);
  const code = session.error ?? 0;
  // The failure removed the focused Play button or the player itself. Carry
  // focus to the way forward rather than leaving it on the page.
  useEffect(() => {
    if (Platform.OS !== "web" || !focused) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    moveFocus(primary.current ?? message.current);
    // Only when the slot first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const retry = canRetry(code);
  return (
    <View style={[styles.error, { width, minHeight: height }]} testID="player-error">
      <View ref={message} style={styles.errorMessage} {...web({ tabIndex: -1 })}>
        <Icon name="alert-circle-outline" color="#ff9e97" size={22} />
        {/* Native announces the error once; on web the message is an alert. */}
        <T
          nativeID="player-error-message"
          style={styles.errorText}
          accessibilityRole={Platform.OS === "web" ? "alert" : undefined}
        >
          {playerError(code)}
        </T>
      </View>
      <View style={styles.errorActions}>
        {retry && (
          <SlotButton
            ref={primary}
            label="Try again"
            icon="refresh"
            primary
            onPress={() => {
              bumpStageFocusToggle();
              session.retry();
            }}
          />
        )}
        {canWatchOnYouTube(code) && (
          <SlotButton
            ref={retry ? undefined : primary}
            label="Watch on YouTube"
            icon="open-outline"
            primary={!retry}
            onPress={session.watchOnYouTube}
          />
        )}
      </View>
    </View>
  );
}

function SlotButton({
  label,
  icon,
  primary = false,
  onPress,
  ref,
}: {
  label: string;
  icon: IconName;
  primary?: boolean;
  onPress: () => void;
  ref?: Ref<View>;
}) {
  return (
    <Tap
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      // The reason is read with the button that focus lands on.
      {...(primary ? web({ "aria-describedby": "player-error-message" }) : null)}
      onPress={onPress}
      style={[styles.slotButton, primary && styles.slotButtonPrimary]}
    >
      <Icon name={icon} size={16} color={primary ? c.media : c.white} />
      <T style={[styles.slotButtonText, primary && { color: c.media }]}>{label}</T>
    </Tap>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: STAGE_BAR,
    paddingBottom: STAGE_BAR - 44,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
  },
  skipLink: {
    position: "absolute",
    top: 0,
    left: 64,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: c.raised,
    zIndex: 2,
  },
  skipLinkText: { ...type.label, color: c.accent },
  offscreen: {
    position: "absolute",
    left: -10000,
    width: 1,
    height: 1,
    minHeight: 1,
    paddingHorizontal: 0,
    overflow: "hidden",
  },
  barTitleSlot: { flex: 1, minWidth: 0, paddingHorizontal: 12, alignItems: "center" },
  barTitle: { ...type.label, color: c.white, textAlign: "center" },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 76,
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 92,
  },
  topRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    minHeight: 44,
  },
  ccSlot: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  posterButton: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  skipPreview: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(15, 17, 21, 0.36)",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.9,
  },
  playDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.white,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 18px rgba(0, 0, 0, 0.32)",
  },
  badgePill: {
    position: "absolute",
    bottom: 44,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15, 17, 21, 0.68)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
  },
  badgeText: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: c.white,
    ...tabular,
  },
  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
    gap: 4,
  },
  timesPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewTimeText: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 16,
    color: c.white,
    ...tabular,
  },
  markedCaption: {
    fontFamily: font.medium,
    fontSize: 11.5,
    lineHeight: 15,
    color: "rgba(255, 255, 255, 0.88)",
    backgroundColor: "rgba(15, 17, 21, 0.62)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  previewRail: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    justifyContent: "center",
  },
  previewFill: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: "#254b7c",
  },
  previewDot: {
    position: "absolute",
    top: -0.5,
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.goldOnMedia,
  },
  previewThumb: {
    position: "absolute",
    top: -4.5,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: c.goldOnMedia,
    borderWidth: 2,
    borderColor: c.white,
    boxShadow: shadows.knob,
  },
  speedPillPreview: {
    minWidth: 36,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
    backgroundColor: "rgba(15, 17, 21, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  speedTextPreview: {
    fontFamily: font.bold,
    fontSize: 11.5,
    lineHeight: 14,
    color: c.white,
    ...tabular,
  },
  fullscreenPreview: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  // On the stage, where the video was: a quiet panel, white words.
  error: {
    alignSelf: "center",
    padding: space.xl,
    gap: space.lg,
    justifyContent: "center",
    backgroundColor: "#171a20",
    borderBottomWidth: 1,
    borderBottomColor: c.onMediaHairline,
  },
  errorMessage: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  errorText: { ...type.body, flex: 1, color: c.white },
  errorActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  slotButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  slotButtonPrimary: { backgroundColor: c.white, borderColor: c.white },
  slotButtonText: { ...type.button, color: c.white },
});
