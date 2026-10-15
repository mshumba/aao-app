import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { MomentRow, SectionHeader, type MomentRowState } from "../kit";
import type { Moment } from "../learning";
import { usePlayback, usePlayerSession } from "../player/PlayerProvider";
import { TextButton } from "../ui";

/** Moments shown before "Show all": enough for a long sermon, not a wall. */
const FIRST = 10;
/** A moment further ahead than this isn't "coming up" yet. */
const COMING_UP = 15 * 60;
/** A moment counts as playing for at least this long after it starts. */
const MIN_SPAN = 20;

type RowState = { state: MomentRowState; minutes?: number };

/** Where each moment stands against the playing position. */
function statesAt(moments: readonly Moment[], seconds: number | null, markedAt: number | null): RowState[] {
  if (seconds == null) {
    // Not loaded: only the moment the page was opened at stands out.
    return moments.map((m) =>
      markedAt != null && Math.abs(m.at - markedAt) <= 15 ? { state: "next" } : { state: "default" },
    );
  }
  let playing = -1;
  moments.forEach((m, i) => {
    if (m.at <= seconds && seconds < Math.max(m.end, m.at + MIN_SPAN)) playing = i;
  });
  const next = moments.findIndex((m) => m.at > seconds);
  return moments.map((m, i) => {
    if (i === playing) return { state: "playing" };
    if (i === next && m.at - seconds <= COMING_UP)
      return { state: "next", minutes: Math.max(0, Math.round((m.at - seconds) / 60)) };
    return { state: m.at < seconds ? "past" : "default" };
  });
}

/**
 * "Moments in this sermon": his words at their timestamps. Pressing one
 * plays from there (with a selection haptic); the one playing is marked,
 * and the next lifts as "Coming up in 4 min". Hidden when there are none.
 */
export const MomentsSection = memo(function MomentsSection({
  moments,
  current,
  markedAt,
  onStart,
  onJump,
}: {
  moments: readonly Moment[];
  /** This sermon is the one loaded in the player. */
  current: boolean;
  /** Opened at this time (a search moment, a shared time): mark its row. */
  markedAt: number | null;
  /** Start the sermon (not loaded yet) at `at`. */
  onStart: (at: number) => void;
  /** Playback jumped to a moment, so the band's thumb can glide there. */
  onJump: () => void;
}) {
  const [all, setAll] = useState(false);
  if (!moments.length) return null;
  const list = all ? moments : moments.slice(0, FIRST);
  return (
    <View testID="sermon-moments">
      <SectionHeader
        title="Moments in this sermon"
        size="sermon"
        count={`${moments.length} moment${moments.length === 1 ? "" : "s"}`}
        style={styles.header}
      />
      {current ? (
        <LiveRows moments={list} onJump={onJump} />
      ) : (
        <Rows
          moments={list}
          states={statesAt(list, null, markedAt)}
          onPress={(at) => {
            tick();
            onJump();
            onStart(at);
          }}
        />
      )}
      {moments.length > FIRST ? (
        <View style={styles.more}>
          <TextButton
            label={all ? "Show fewer" : `Show all ${moments.length} moments`}
            icon={all ? "chevron-up" : "chevron-down"}
            onPress={() => setAll((v) => !v)}
          />
        </View>
      ) : null}
    </View>
  );
});

function tick() {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

/** The rows for the loaded sermon, following playback. */
function LiveRows({ moments, onJump }: { moments: readonly Moment[]; onJump: () => void }) {
  const session = usePlayerSession();
  const p = usePlayback();
  const { seek, play } = p;
  // A press while the player is still loading lands once it's ready.
  const pending = useRef<number | null>(null);
  const ready = session.phase === "ready";
  useEffect(() => {
    if (!ready || pending.current == null) return;
    seek(pending.current);
    play();
    pending.current = null;
  }, [ready, seek, play]);
  const onPress = useCallback(
    (at: number) => {
      tick();
      onJump();
      if (!ready) {
        pending.current = at;
        return;
      }
      seek(at);
      play();
    },
    [ready, seek, play, onJump],
  );
  return <Rows moments={moments} states={statesAt(moments, p.seconds, null)} onPress={onPress} />;
}

function Rows({
  moments,
  states,
  onPress,
}: {
  moments: readonly Moment[];
  states: RowState[];
  onPress: (at: number) => void;
}) {
  // One chip width for the list, so every quote starts on the same edge
  // (wider once a time runs past the hour: "▶ 1:09:18").
  const stampWidth = useMemo(() => (moments.some((m) => m.at >= 3600) ? 86 : 74), [moments]);
  return (
    <View>
      {moments.map((m, i) => {
        const s = states[i];
        const lifted = (k?: RowState) => k?.state === "playing" || k?.state === "next";
        return (
          <MomentRow
            key={m.id}
            testID="moment-row"
            at={m.at}
            title={m.title}
            quote={m.quote}
            state={s.state}
            comingUpMinutes={s.minutes}
            stampWidth={stampWidth}
            // As in the concept, a rule under the header too.
            first={i > 0 && lifted(states[i - 1])}
            onPress={onPress}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 20, marginBottom: 6, marginHorizontal: 4 },
  more: { marginTop: 4 },
});
