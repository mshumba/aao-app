import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused } from "expo-router";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { font, radius, space } from "../theme";
import { Icon, T, Tap, c, moveFocus, pressedTint, s, web } from "../ui";
import {
  asksViewer,
  clock,
  spokenClock,
  usePlayback,
  usePlayerSession,
} from "./PlayerProvider";

/**
 * Transport for the loaded sermon, shown under the video on its screen.
 * `scroll` is the page's scroll view, which waits while the scrubber is
 * dragged sideways.
 */
export function NowPlaying({
  focusTransport = false,
  scroll,
}: {
  /** Watch was just pressed here, so its button has gone. */
  focusTransport?: boolean;
  scroll?: RefObject<unknown>;
}) {
  const session = usePlayerSession();
  const p = usePlayback();
  const focused = useIsFocused();
  const toggle = useRef<View>(null);
  const firstAttempt = useRef(session.attempt);
  const { attempt } = session;
  // After Watch or Try again the pressed control disappears. Continue from
  // Play/Pause rather than dropping focus to the top of the page.
  useEffect(() => {
    if (!focused) return;
    if (focusTransport || attempt !== firstAttempt.current)
      moveFocus(toggle.current);
    // Only on the Watch or Try again that loaded the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, focusTransport]);
  // A failed player shows its message and actions in the video area.
  if (session.phase === "error") return null;
  const loading = session.phase === "loading";
  const playing = p.playing;
  const speed = (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`Playback speed ${p.rate} times`}
      accessibilityHint="Changes the speed"
      onPress={p.cycleRate}
      disabled={loading}
      feedback="highlight"
      highlightColor={pressedTint}
      style={styles.speed}
    >
      <T style={styles.speedText} maxFontSizeMultiplier={1.6}>
        {`${p.rate}×`}
      </T>
    </Tap>
  );
  return (
    <View style={styles.panel}>
      <Scrubber scroll={scroll} center={speed} />
      <View style={styles.transport}>
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
            <ActivityIndicator color={c.onAccent} />
          ) : (
            <View style={!playing && styles.playNudge}>
              <Icon name={playing ? "pause" : "play"} color={c.onAccent} size={26} />
            </View>
          )}
        </Tap>
        <Skip seconds={30} disabled={loading} />
      </View>
      {/* Every status is announced; only the ones that ask something of the
          viewer are shown, since playing and paused are plain to see. */}
      <T
        style={[s.meta, styles.status, !asksViewer(p.status) && styles.quiet]}
        accessibilityLiveRegion="polite"
        testID="playback-status"
      >
        {p.status}
      </T>
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
      {/* Drawn with the number in the arc (Ionicons has no such glyph). */}
      <MaterialCommunityIcons
        name={back ? "rewind-15" : "fast-forward-30"}
        size={30}
        color={c.text}
        accessible={false}
        {...web({ "aria-hidden": true })}
      />
    </Tap>
  );
}

/**
 * Tap or drag sideways to seek. Only the released position is sent to the
 * provider; while dragging, the times preview the target. A vertical swipe
 * that starts here scrolls the page instead, and seeks nothing.
 * Keyboard (web): arrows step like the skip buttons, Home and End jump.
 */
function Scrubber({
  scroll,
  center,
}: {
  scroll?: RefObject<unknown>;
  /** Shown between the elapsed and remaining times (the speed control). */
  center?: ReactNode;
}) {
  const p = usePlayback();
  const [width, setWidth] = useState(1);
  const [drag, setDrag] = useState<number | null>(null);
  const ready = p.duration > 0;
  const at = (x: number) => Math.min(1, Math.max(0, x / width));
  const seekTo = (fraction: number) => p.seek(fraction * p.duration);
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
  // The page waits to scroll until a drag here is clearly not sideways.
  if (scroll) pan.blocksExternalGesture(scroll as never);
  const tap = Gesture.Tap()
    .enabled(ready)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (success) seekTo(at(e.x));
    });
  const shown = drag !== null ? drag * p.duration : p.seconds;
  const progress = ready ? Math.min(1, shown / p.duration) : 0;
  const keys: Record<string, () => void> = {
    ArrowRight: () => p.skip(30),
    ArrowUp: () => p.skip(30),
    ArrowLeft: () => p.skip(-15),
    ArrowDown: () => p.skip(-15),
    Home: () => p.seek(0),
    End: () => p.seek(p.duration),
  };
  return (
    <View>
      <GestureDetector gesture={Gesture.Race(pan, tap)} touchAction="pan-y">
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width || 1)}
        style={styles.hit}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(p.duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${spokenClock(shown)} of ${spokenClock(p.duration)}`}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) =>
          p.skip(e.nativeEvent.actionName === "increment" ? 30 : -15)
        }
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
        <View style={styles.rail}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View
          style={[
            styles.thumb,
            { pointerEvents: "none" },
            drag !== null && styles.thumbActive,
            { left: `${progress * 100}%` },
          ]}
        />
      </View>
      </GestureDetector>
      <View style={styles.times}>
        <T style={styles.time} testID="elapsed" maxFontSizeMultiplier={1.6}>
          {clock(shown)}
        </T>
        {center}
        <T style={[styles.time, styles.timeEnd]} maxFontSizeMultiplier={1.6}>
          {ready ? `-${clock(p.duration - shown)}` : "--:--"}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The scrubber's touch band reaches 6pt further above its track than it
  // used to; the margin gives that back, so the track stays where it was.
  panel: { marginTop: space.md - 6, gap: space.xs },
  // A 44pt band to grab, around a 4pt track.
  hit: { height: 44, justifyContent: "center" },
  // A neutral track (a wash of the text colour) under the navy progress, so
  // it reads on the ivory page and on the sermon's artwork wash alike. Dark
  // enough (3:1 on ivory and sand) that the length still to play is seen.
  rail: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(27, 30, 36, 0.5)",
    overflow: "hidden",
  },
  fill: { height: 4, backgroundColor: c.accent },
  // Navy with a white edge, so it stands out from the fill it sits on.
  thumb: {
    position: "absolute",
    top: 15,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: c.accent,
    borderWidth: 2,
    borderColor: c.surface,
    boxShadow: "0 1px 3px rgba(27, 30, 36, 0.3)",
  },
  thumbActive: { transform: [{ scale: 1.3 }] },
  times: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  time: {
    ...StyleSheet.flatten(s.meta),
    minWidth: 64,
    fontVariant: ["tabular-nums"],
  },
  timeEnd: { textAlign: "right" },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xl,
  },
  speed: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  // Navy, like a link: the one time readout you can change.
  speedText: {
    ...StyleSheet.flatten(s.meta),
    fontFamily: font.semibold,
    color: c.accent,
    fontVariant: ["tabular-nums"],
  },
  skip: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(31, 58, 95, 0.24)",
  },
  // The play triangle's visual centre sits right of its box centre.
  playNudge: { transform: [{ translateX: 2 }] },
  status: { textAlign: "center" },
  // Announced, not shown; its line stays, so the page doesn't jump when a
  // status appears.
  quiet: { opacity: 0 },
});
