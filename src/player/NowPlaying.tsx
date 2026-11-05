import type { ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { c, font, radius, tabular, textCap, type } from "../theme";
import { T, Tap, web } from "../ui";
import {
  asksViewer,
  clock,
  spokenClock,
  usePlayback,
  usePlayerSession,
} from "./PlayerProvider";
import { focusStageToggle } from "./stage/VideoOverlay";

/** Moments on the band, in seconds (the band turns them into ticks). */
export type BandMarks = {
  /** Moments in playing order: their start times and keys. */
  moments: readonly { key: string; at: number }[];
  /** The moment to draw larger (the search moment, the one playing). */
  activeKey?: string | null;
  /** Used to place the marks until the player knows the real length. */
  estimate: number;
};

/**
 * The centre of the times line while a sermon is loaded: a status that asks
 * something of the viewer ("Tap Play to start") first, then
 * "Resuming at 4:10 · Start over" or "Started at the message · Play from the
 * start", then whatever the page puts there (`fallback`). Every status is
 * announced; playing and paused aren't shown, since they're plain to see.
 */
export function PlayerCenter({ fallback }: { fallback?: ReactNode }) {
  const session = usePlayerSession();
  const p = usePlayback();
  if (session.phase === "error") return fallback ?? null;
  const asks = asksViewer(p.status);
  const resumed = session.resumedFrom > 0 && !asks;
  const message = !resumed && session.messageFrom > 0 && !asks;
  return (
    <>
      <T
        style={[styles.status, !asks && styles.quiet]}
        numberOfLines={asks ? 2 : 1}
        accessibilityLiveRegion="polite"
        testID="playback-status"
        maxFontSizeMultiplier={textCap.chip}
      >
        {p.status}
      </T>
      {resumed ? (
        <View style={styles.resume} testID="resume-note">
          <T
            style={styles.resumeText}
            accessibilityLabel={`Resuming at ${spokenClock(session.resumedFrom)}`}
            maxFontSizeMultiplier={textCap.chip}
          >
            {`Resuming at ${clock(session.resumedFrom)}`}
          </T>
          <Dot />
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Start over"
            accessibilityHint="Plays the sermon from the beginning"
            onPress={() => {
              session.startOver();
              // The note and its button go; carry on from Play/Pause.
              focusStageToggle();
              AccessibilityInfo.announceForAccessibility("Starting from the beginning.");
            }}
            feedback="dim"
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={styles.startOver}
          >
            <T style={styles.startOverText} maxFontSizeMultiplier={textCap.chip}>
              Start over
            </T>
          </Tap>
        </View>
      ) : null}
      {/* Kept in place (empty) so screen readers on the web and Android
          announce the note as it appears; iOS hears it from the player. */}
      <View accessibilityLiveRegion="polite">
        {message ? (
          <View style={styles.resume} testID="message-note">
            <T
              style={styles.resumeText}
              accessibilityLabel={`Started where the preaching starts, at ${spokenClock(session.messageFrom)}`}
              maxFontSizeMultiplier={textCap.chip}
            >
              Started at the message
            </T>
            <Dot />
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Play from the start"
              accessibilityHint="Plays the sermon from the beginning, before the preaching"
              onPress={() => {
                session.startOver();
                // The note and its button go; carry on from Play/Pause.
                focusStageToggle();
                AccessibilityInfo.announceForAccessibility("Playing from the start.");
              }}
              feedback="dim"
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={styles.startOver}
            >
              <T style={styles.startOverText} maxFontSizeMultiplier={textCap.chip}>
                Play from the start
              </T>
            </Tap>
          </View>
        ) : null}
      </View>
      {!resumed && !message && !asks ? fallback ?? null : null}
    </>
  );
}

/** The dot between a note and its button: seen, never read out. */
function Dot() {
  return (
    <T
      style={styles.resumeText}
      accessibilityElementsHidden
      importantForAccessibility="no"
      {...web({ "aria-hidden": true })}
    >
      ·
    </T>
  );
}

const styles = StyleSheet.create({
  // Shown in the centre when it asks something of the viewer.
  status: {
    ...type.metaSmall,
    color: c.muted,
    textAlign: "left",
    marginTop: 6,
  },
  // Announced, not shown, and out of the way of taps on the strip.
  quiet: {
    position: "absolute",
    opacity: 0,
    marginTop: 0,
    pointerEvents: "none",
  },
  resume: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 5,
    marginTop: 6,
  },
  resumeText: { ...type.metaSmall, color: c.muted, pointerEvents: "none", ...tabular },
  startOver: { paddingVertical: 2, borderRadius: radius.sm },
  startOverText: {
    ...type.metaSmall,
    fontFamily: font.bold,
    color: c.accent,
    textDecorationLine: "underline",
  },
});
