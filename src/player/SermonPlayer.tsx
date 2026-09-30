import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Linking, View } from "react-native";
import { Sermon } from "../data/sermons";
import { Button, T, Thumbnail, c, s } from "../ui";
import Embed from "./Embed";
import { PlayerEvent, playerError } from "./types";

// Only the player surface resets on blur/background; the details and scroll stay mounted.
export default function SermonPlayer({ sermon }: { sermon: Sermon }) {
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === "active");
  const position = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  return (
    <PlayerSurface
      key={String(focused && active)}
      sermon={sermon}
      canPlay={focused && active}
      getStart={() => position.current}
      onProgress={(seconds) => {
        position.current = seconds;
      }}
    />
  );
}
function PlayerSurface({
  sermon,
  canPlay,
  getStart,
  onProgress,
}: {
  sermon: Sermon;
  canPlay: boolean;
  getStart: () => number;
  onProgress: (seconds: number) => void;
}) {
  const [width, setWidth] = useState(350);
  const [requested, setRequested] = useState(false);
  const [status, setStatus] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [start, setStart] = useState(0);
  const [error, setError] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loading = status === "Loading YouTube player…";
  useEffect(() => {
    if (!requested || !loading) return;
    const timer = setTimeout(() => {
      setError(0);
      setRequested(false);
      setStatus("");
      AccessibilityInfo.announceForAccessibility(playerError(0));
    }, 15000);
    return () => clearTimeout(timer);
  }, [requested, loading]);
  function handleEvent(e: PlayerEvent) {
    if (e.type === "error") {
      setError(e.code);
      setRequested(false);
      setStatus("");
      AccessibilityInfo.announceForAccessibility(playerError(e.code));
    } else if (e.type === "ready")
      setStatus("Player ready. Use YouTube’s Play control to start.");
    else {
      if (typeof e.seconds === "number") {
        onProgress(e.seconds);
        setSeconds(Math.floor(e.seconds));
      }
      setStatus(
        e.state === 1
          ? "Playing"
          : e.state === 2
            ? "Paused"
            : e.state === 0
              ? "Message ended"
              : e.state === 3
                ? "Buffering…"
                : "Player ready.",
      );
    }
  }
  function load() {
    setError(null);
    setStart(Math.floor(getStart()));
    setAttempt((a) => a + 1);
    setStatus("Loading YouTube player…");
    setRequested(true);
  }
  const height = Math.max(200, (width * 9) / 16);
  return (
    <>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ minWidth: 200 }}
      >
        {requested && canPlay ? (
          <Embed
            key={attempt}
            videoId={sermon.id}
            height={height}
            startSeconds={start}
            onEvent={handleEvent}
          />
        ) : (
          <Thumbnail sermon={sermon} height={height} />
        )}
      </View>
      {error !== null ? (
        <View
          accessibilityLiveRegion="assertive"
          style={{ paddingVertical: 18, gap: 14 }}
        >
          <T style={{ color: c.error }}>{playerError(error)}</T>
          <Button label="Try player again" onPress={load} />
          <Button
            label="Open on YouTube"
            secondary
            icon="open-outline"
            onPress={() => void Linking.openURL(sermon.source)}
          />
        </View>
      ) : !requested ? (
        <View style={{ marginTop: 14 }}>
          <Button label="Play sermon" icon="play" onPress={load} />
        </View>
      ) : null}
      {!!status && (
        <T
          accessibilityLiveRegion="polite"
          testID="playback-status"
          style={[s.small, { marginTop: 12 }]}
        >
          {status}
        </T>
      )}
      {status === "Playing" && (
        <T
          testID="playback-progress"
          accessibilityLiveRegion="none"
          style={s.small}
        >
          {seconds} seconds
        </T>
      )}
      {requested && (
        <View style={{ marginTop: 10 }}>
          <Button
            label="Open on YouTube"
            icon="open-outline"
            secondary
            onPress={() => void Linking.openURL(sermon.source)}
          />
        </View>
      )}
    </>
  );
}
