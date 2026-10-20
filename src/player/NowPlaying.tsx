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
 * "Resuming at 4:10 · Start over", then whatever the page puts there
 * (`fallback`). Every status is announced; playing and paused aren't shown,
 * since they're plain to see.
 */
export function PlayerCenter({ fallback }: { fallback?: ReactNode }) {
  const session = usePlayerSession();
  const p = usePlayback();
  if (session.phase === "error") return fallback ?? null;
  const asks = asksViewer(p.status);
  const resumed = session.resumedFrom > 0 && !asks;
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
          <T style={styles.resumeText} {...web({ "aria-hidden": true })}>
            ·
          </T>
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
      ) : !asks ? (
        fallback ?? null
      ) : null}
    </>
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
