import { useIsFocused } from "expo-router";
import { memo, useEffect, useRef, useState, type Ref } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { headline } from "../data/display";
import type { Sermon } from "../data/sermons";
import { Artwork, RoundButton } from "../kit";
import { STAGE_BAR } from "../player/layout";
import { usePlayerSession } from "../player/PlayerProvider";
import { canRetry, canWatchOnYouTube, playerError } from "../player/types";
import { useGo } from "../navigation";
import { c, easeOut, gradients, radius, space, type } from "../theme";
import { Icon, T, Tap, gradient, moveFocus, web, type IconName } from "../ui";

/**
 * The stage's top bar, between the status bar and the video: Back (a
 * chevron down, as the concept draws it) and "…". It sits above the video,
 * never over it, so YouTube's own controls are always reachable.
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
  /** Web: offer a skip link to the playing video, right after Back. */
  skipToPlayer: boolean;
  onMore: () => void;
  moreRef?: Ref<View>;
  /** The headline, faded into the bar once the page's title has scrolled under it. */
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
              // Stretched to the slot, so a long title ends in an ellipsis
              // instead of running under Back and More options.
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

/**
 * The video player comes last in keyboard order, since it floats above every
 * screen. This link, shown when focused, jumps straight to it.
 */
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
 * The sermon's artwork where the video will play, with a 52pt glass play
 * disc in its lower-left corner, clear of the poster's own lettering. The
 * art always fills the frame: where YouTube's 200pt minimum makes the frame
 * taller than 16:9 (a narrow phone), it's drawn at the frame's height and
 * its sides are clipped, never left with bars. Tapping it starts the
 * sermon, like the Watch pill below it; the pill is the one control
 * assistive technology meets, so this stays out of the accessibility tree.
 */
export const Poster = memo(function Poster({
  sermon,
  width,
  height,
  radius: corner,
  onPress,
}: {
  sermon: Sermon;
  width: number;
  height: number;
  radius: number;
  onPress: () => void;
}) {
  const artWidth = Math.max(width, Math.round((height * 16) / 9));
  return (
    <Pressable
      onPress={onPress}
      accessible={false}
      focusable={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true, tabIndex: -1 })}
      style={{ width, height, borderRadius: corner, overflow: "hidden" }}
    >
      {({ pressed }) => (
        <>
          <Artwork
            art={sermon}
            width={artWidth}
            radius={corner}
            lift="none"
            priority="high"
            fallback={headline(sermon)}
            style={{ width: artWidth, height, marginLeft: (width - artWidth) / 2 }}
          />
          <View style={[StyleSheet.absoluteFill, gradient(gradients.videoShade), { pointerEvents: "none" }]} />
          <Animated.View
            style={[
              styles.disc,
              {
                transform: [{ scale: pressed ? 0.94 : 1 }],
                transitionProperty: "transform",
                transitionDuration: 120,
                transitionTimingFunction: easeOut,
              },
            ]}
          >
            <View style={{ marginLeft: 2 }}>
              <Icon name="play" size={22} color={c.white} />
            </View>
          </Animated.View>
        </>
      )}
    </Pressable>
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
          <SlotButton ref={primary} label="Try again" icon="refresh" primary onPress={session.retry} />
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
  // Off the page until focused (opacity on a Tap would be overridden by its
  // own press styles, leaving a dot showing).
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
  // Glass, like the stage's round buttons, 16pt in from the frame's corner.
  disc: {
    position: "absolute",
    left: space.lg,
    bottom: space.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.glass,
    borderWidth: 1,
    borderColor: c.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
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
