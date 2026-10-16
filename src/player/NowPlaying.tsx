import { useIsFocused } from "expo-router";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  StyleSheet,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  STRIP_HEIGHT,
  TimesRow,
  Track,
  railFraction,
  useGlide,
  useStripWidth,
  type Tick,
} from "../sermon/Track";
import { c, font, fontSize, radius, space, tabular, textCap, type } from "../theme";
import { Icon, T, Tap, moveFocus, web } from "../ui";
import {
  asksViewer,
  clock,
  spokenClock,
  usePlayback,
  usePlayerSession,
} from "./PlayerProvider";

/** Moments on the band, in seconds (the band turns them into ticks). */
export type BandMarks = {
  /** Moments in playing order: their start times and keys. */
  moments: readonly { key: string; at: number }[];
  /** The moment to draw larger (the search moment, the one playing). */
  activeKey?: string | null;
  /** Used to place the marks until the player knows the real length. */
  estimate: number;
};

/** The marks as fractions of the sermon's length. */
export function bandTicks(marks: BandMarks, duration: number) {
  const total = duration > 0 ? duration : marks.estimate;
  const ticks: Tick[] = total
    ? marks.moments.map((m) => ({ key: m.key, at: m.at / total, active: m.key === marks.activeKey }))
    : [];
  return { ticks };
}

/**
 * The stage's scrubber, following the loaded sermon. Tap or drag sideways
 * to seek; only the released position is sent to the provider, and while
 * dragging the times preview the target. A vertical swipe that starts here
 * scrolls the page instead.
 *
 * Keyboard (web): arrows step like the skip buttons, Home and End jump.
 * Screen readers: adjust by 15 seconds, or jump to the next or previous
 * moment.
 */
export const LiveBand = memo(function LiveBand({
  marks,
  glideKey,
  center,
}: {
  marks: BandMarks;
  /** Changes when playback jumps to a moment, so the thumb glides there. */
  glideKey: number;
  center?: ReactNode;
}) {
  const p = usePlayback();
  const [width, onLayout] = useStripWidth();
  const [drag, setDrag] = useState<number | null>(null);
  const glide = useGlide(glideKey);
  const ready = p.duration > 0;
  const { seek, duration } = p;
  // Built again only when the strip or the sermon's length changes, never
  // with each second of playback (that would re-attach the native handlers
  // every second). `seek` is new each second, but it only depends on the
  // length, which is listed.
  const gesture = useMemo(() => {
    const at = (x: number) => railFraction(x, width);
    const seekTo = (fraction: number) => seek(fraction * duration);
    const pan = Gesture.Pan()
      .enabled(ready)
      .activeOffsetX([-8, 8])
      .failOffsetY([-8, 8])
      .runOnJS(true)
      .onStart((e) => setDrag(at(e.x)))
      .onUpdate((e) => setDrag(at(e.x)))
      .onEnd((e, success) => {
        if (success) seekTo(at(e.x));
      })
      .onFinalize(() => setDrag(null));
    const tap = Gesture.Tap()
      .enabled(ready)
      .maxDistance(10)
      .runOnJS(true)
      .onEnd((e, success) => {
        if (success) seekTo(at(e.x));
      });
    return Gesture.Race(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, width, duration]);
  const shown = drag !== null ? drag * p.duration : p.seconds;
  const total = ready ? p.duration : marks.estimate;
  const position = total ? Math.min(1, shown / total) : 0;
  const { ticks } = bandTicks(marks, p.duration);
  const keys: Record<string, () => void> = {
    ArrowRight: () => p.skip(30),
    ArrowUp: () => p.skip(30),
    ArrowLeft: () => p.skip(-15),
    ArrowDown: () => p.skip(-15),
    Home: () => p.seek(0),
    End: () => p.seek(p.duration),
  };
  const starts = marks.moments.map((m) => m.at);
  const nextMoment = starts.find((s) => s > p.seconds + 1);
  const previousMoment = [...starts].reverse().find((s) => s < p.seconds - 3);
  const actions = [
    { name: "increment" },
    { name: "decrement" },
    ...(nextMoment != null ? [{ name: "nextMoment", label: "Next moment" }] : []),
    ...(previousMoment != null ? [{ name: "previousMoment", label: "Previous moment" }] : []),
  ];
  return (
    <View>
      <GestureDetector gesture={gesture} touchAction="pan-y">
        <View
          onLayout={onLayout}
          style={styles.strip}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Playback position"
          aria-valuemin={0}
          aria-valuemax={Math.round(p.duration)}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={`${spokenClock(shown)} of ${spokenClock(p.duration)}`}
          accessibilityActions={actions}
          onAccessibilityAction={(e) => {
            switch (e.nativeEvent.actionName) {
              case "increment":
                return p.skip(15);
              case "decrement":
                return p.skip(-15);
              case "nextMoment":
                return nextMoment != null && p.seek(nextMoment);
              case "previousMoment":
                return previousMoment != null && p.seek(previousMoment);
            }
          }}
          {...web({
            tabIndex: ready ? 0 : -1,
            onKeyDown: (e: { key: string; preventDefault: () => void }) => {
              const action = ready ? keys[e.key] : undefined;
              if (!action) return;
              e.preventDefault();
              action();
            },
          })}
          testID="scrubber"
        >
          <Track
            width={width}
            position={position}
            ticks={ticks}
            dragging={drag !== null}
            glide={glide}
          />
        </View>
      </GestureDetector>
      <TimesRow
        left={clock(shown)}
        leftTestID="elapsed"
        right={ready ? `−${clock(p.duration - shown)}` : "−:––"}
        leftLabel={`${spokenClock(shown)} played`}
        rightLabel={ready ? `${spokenClock(p.duration - shown)} left` : "Length not known yet"}
        center={center}
      />
    </View>
  );
});

/**
 * The centre of the times line while a sermon is loaded: a status that asks
 * something of the viewer ("Tap play in the video to start") first, then
 * "Resuming at 4:10 · Start over", then whatever the page puts there
 * (`fallback`). Every status is announced; playing and paused aren't shown,
 * since they're plain to see.
 */
export function PlayerCenter({
  toggle,
  fallback,
}: {
  /** Play/Pause, where focus goes after Start over. */
  toggle: RefObject<View | null>;
  fallback?: ReactNode;
}) {
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
              moveFocus(toggle.current);
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

/**
 * The transport on the stage, for the loaded sermon, in two centred rows:
 * back 15, a big white play/pause and forward 30, then the quieter speed
 * and whatever the page adds (Save and Share, as bare icons). After Watch or
 * Try again the pressed control disappears, so focus continues from
 * Play/Pause.
 */
export function Transport({
  toggle,
  focusTransport = false,
  children,
}: {
  toggle: RefObject<View | null>;
  /** Watch was just pressed here, so its button has gone. */
  focusTransport?: boolean;
  /** The bare actions after the speed (Save, Share). */
  children?: ReactNode;
}) {
  const session = usePlayerSession();
  const p = usePlayback();
  const focused = useIsFocused();
  const firstAttempt = useRef(session.attempt);
  const { attempt } = session;
  useEffect(() => {
    if (!focused) return;
    if (focusTransport || attempt !== firstAttempt.current) moveFocus(toggle.current);
    // Only on the Watch or Try again that loaded the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, focusTransport]);
  const loading = session.phase === "loading";
  const playing = p.playing;
  return (
    <View style={styles.transport}>
      <View style={styles.group}>
        <Skip seconds={-15} disabled={loading} />
        <Tap
          ref={toggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause" : "Play"}
          onPress={p.toggle}
          // Busy, not disabled, so it can hold focus while the player loads.
          busy={loading}
          aria-busy={loading}
          style={styles.play}
          testID="now-playing-toggle"
        >
          {loading ? (
            <ActivityIndicator color={c.media} />
          ) : (
            <View style={!playing && styles.playNudge}>
              <Icon name={playing ? "pause" : "play"} color={c.media} size={28} />
            </View>
          )}
        </Tap>
        <Skip seconds={30} disabled={loading} />
      </View>
      <View style={styles.acts}>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${p.rate} times`}
          accessibilityHint="Changes the speed"
          onPress={p.cycleRate}
          disabled={loading}
          hitSlop={2}
          style={styles.speed}
        >
          <T style={styles.speedText} maxFontSizeMultiplier={textCap.chip}>
            {`${p.rate}×`}
          </T>
        </Tap>
        {children}
      </View>
    </View>
  );
}

function Skip({ seconds, disabled }: { seconds: number; disabled: boolean }) {
  const p = usePlayback();
  const back = seconds < 0;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={back ? "Back 15 seconds" : "Forward 30 seconds"}
      onPress={() => p.skip(seconds)}
      disabled={disabled}
      style={styles.skip}
    >
      {/* The concept's glyph: an open arc with an arrowhead and the seconds
          inside it, turning back (15) or forward (30). */}
      <Image
        source={back ? SKIP_BACK : SKIP_FORWARD}
        accessible={false}
        {...web({ "aria-hidden": true })}
        style={styles.glyph}
        resizeMode="contain"
      />
    </Tap>
  );
}

const SKIP_BACK = require("../../assets/icons/skip-back-15.png");
const SKIP_FORWARD = require("../../assets/icons/skip-forward-30.png");

/** The strip's height, for screens laying out the band before it mounts. */
export const BAND_STRIP = STRIP_HEIGHT;

const styles = StyleSheet.create({
  strip: { height: STRIP_HEIGHT },
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
  // Two centred rows at every width: the transport, then the quiet actions.
  transport: { alignItems: "center", rowGap: space.md },
  // The 28pt skip glyphs sit in 44pt targets, 28pt either side of play.
  group: { flexDirection: "row", alignItems: "center", gap: 28 },
  skip: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  glyph: { width: 28, height: 28, tintColor: c.white },
  play: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.white,
    alignItems: "center",
    justifyContent: "center",
  },
  // The play triangle's visual centre sits right of its box centre.
  playNudge: { transform: [{ translateX: 2 }] },
  acts: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xl },
  // Bare, like Save and Share beside it: a 36pt readout in a 44pt target.
  // Grows for "1.25×".
  speed: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  speedText: {
    fontFamily: font.extrabold,
    fontSize: fontSize.lead,
    lineHeight: 20,
    color: c.onMediaMuted,
    ...tabular,
  },
});
