import { VideoView, useVideoPlayer, type VideoPlayer, type VideoSource } from "expo-video";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { hlsUrl } from "./media";
import type { PlayerCommand, PlayerEvent, PlayerProps } from "./types";

/** How often the player reports its place while playing, in seconds. */
const TIME_EVERY = 0.5;

type Player = Pick<
  VideoPlayer,
  "playing" | "status" | "currentTime" | "duration" | "playbackRate" | "play" | "pause" | "addListener"
>;

/**
 * Connects an expo-video player to the app's player seam: it reports in
 * YouTube's terms (PlayerEvent: -1 unstarted, 0 ended, 1 playing, 2 paused,
 * 3 buffering), so PlayerProvider treats both engines alike, and it carries
 * out the app's commands.
 */
export function connect(player: Player, startSeconds: number, emit: (event: PlayerEvent) => void) {
  let ready = false;
  let started = false;
  // Asked to play, so a stall is buffering rather than a pause.
  let wanted = false;
  let ended = false;
  // After an error it says nothing more: PlayerProvider has moved on (to
  // YouTube, or its error panel) and a late "paused" would undo that.
  let failed = false;
  // The length sourceLoad gives, until the player itself knows it.
  let loaded = 0;
  // The last state sent. expo-video only reports a change, so a pause
  // during a stall (when it was already not playing) says nothing itself.
  let reported = -1;
  // The speed the viewer chose. On iOS setting the speed starts a paused
  // player, so a paused one takes it when it next plays.
  let rate = 1;
  const duration = () => player.duration || loaded || undefined;
  const send = (state: number, seconds = player.currentTime) => {
    reported = state;
    emit({ type: "state", state, seconds, duration: duration() });
  };
  const applyRate = () => {
    if (player.playbackRate !== rate) player.playbackRate = rate;
  };
  const fail = () => {
    failed = true;
    emit({ type: "error", code: 0 });
  };
  const becomeReady = () => {
    ready = true;
    if (startSeconds > 0) player.currentTime = startSeconds;
    emit({ type: "ready", duration: duration() });
  };
  const subscriptions = [
    player.addListener("sourceLoad", (e) => {
      if (e.duration > 0) loaded = e.duration;
    }),
    player.addListener("statusChange", ({ status }) => {
      if (failed) return;
      if (status === "error") fail();
      else if (status === "readyToPlay" && !ready) becomeReady();
      // Ran out of video while playing; playingChange follows once it resumes.
      else if (status === "loading" && ready && wanted && !player.playing) send(3);
    }),
    player.addListener("playingChange", ({ isPlaying }) => {
      if (failed || !ready) return;
      if (isPlaying) {
        started = true;
        wanted = true;
        ended = false;
        // Started from the lock screen or picture in picture, at the speed
        // it had before the viewer changed it while paused.
        applyRate();
        send(1);
        return;
      }
      // The end is reported by playToEnd.
      if (ended) return;
      if (player.status === "loading" && wanted) {
        send(3);
        return;
      }
      // Paused: by the app, the lock screen or picture in picture.
      wanted = false;
      send(started ? 2 : -1);
    }),
    player.addListener("timeUpdate", ({ currentTime }) => {
      if (!failed && player.playing) send(1, currentTime);
    }),
    player.addListener("playToEnd", () => {
      if (failed) return;
      ended = true;
      wanted = false;
      send(0, duration() ?? player.currentTime);
    }),
    player.addListener("playbackRateChange", ({ playbackRate }) => {
      if (!failed) emit({ type: "rate", rate: playbackRate });
    }),
  ];
  // Anything that happened before this was listening.
  if (player.status === "error") fail();
  else if (player.status === "readyToPlay") becomeReady();

  const command = (c: PlayerCommand) => {
    if (failed) return;
    switch (c.type) {
      case "play":
        wanted = true;
        // Played to the end: Play starts it again, as YouTube's does.
        if (ended) {
          ended = false;
          player.currentTime = 0;
        }
        applyRate();
        player.play();
        return;
      case "pause":
        wanted = false;
        player.pause();
        // Paused during a stall: the player reports nothing, as it wasn't
        // playing, so the app would stay on "Buffering…".
        if (reported === 3) send(started ? 2 : -1);
        return;
      case "seek":
        ended = false;
        player.currentTime = c.seconds;
        return;
      case "rate":
        rate = c.rate;
        if (player.playing || wanted) applyRate();
        // Paused: kept for Play, and the app shows it now.
        else emit({ type: "rate", rate });
        return;
      case "captions":
        // R2 has no caption track yet, so the CC button is hidden while this
        // engine plays (VideoOverlay). A WebVTT track is a later follow-up.
        return;
    }
  };
  return { command, disconnect: () => subscriptions.forEach((subscription) => subscription.remove()) };
}

/**
 * The app's own video player for sermons on R2 (media.ts), with no native
 * controls: the stage overlay drives it, as it drives YouTube's. It keeps
 * playing in the background, shows the sermon on the lock screen and in
 * Control Center (title, "Apostle Arome Osayi", its thumbnail) and goes into
 * picture in picture when the viewer leaves the app while it plays (the
 * expo-video config plugin in app.json enables both).
 */
export default function NativeVideo({
  videoId,
  height,
  startSeconds = 0,
  onEvent,
  nowPlaying,
  ref,
}: PlayerProps) {
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  }, [onEvent]);
  // A new source would make a new player, so the source and start stay as
  // they were when this one mounted (PlayerHost mounts one for each load).
  const [source] = useState<VideoSource>(() => ({
    uri: hlsUrl(videoId),
    contentType: "hls",
    metadata: nowPlaying,
  }));
  const [from] = useState(startSeconds);
  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = TIME_EVERY;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    // A faster or slower sermon keeps the preacher's voice. iOS does this
    // by default; Android's expo-video doesn't.
    p.preservesPitch = true;
  });
  const link = useRef<ReturnType<typeof connect> | null>(null);
  useEffect(() => {
    const next = connect(player, from, (event) => callback.current(event));
    link.current = next;
    return () => {
      next.disconnect();
      if (link.current === next) link.current = null;
    };
  }, [player, from]);
  useImperativeHandle(ref, () => ({ command: (command) => link.current?.command(command) }), []);
  return (
    <VideoView
      player={player}
      style={{ width: "100%", height, backgroundColor: "#000" }}
      nativeControls={false}
      contentFit="contain"
      allowsPictureInPicture
      startsPictureInPictureAutomatically
      // Android: drawn as a texture, so full screen's 90° turn (PlayerHost)
      // turns the picture with it.
      surfaceType="textureView"
    />
  );
}
