import { useEffect, useImperativeHandle, useRef } from "react";
import { PlayerProps } from "./types";
type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  unloadModule: (module: string) => void;
};

// Captions are off unless the viewer turns them on in the player (owner,
// 16 Oct 2026). YouTube may load them as the player readies or as playback
// first starts, so they're switched off at both.
function captionsOff(p: YouTubePlayer | undefined) {
  try {
    p?.unloadModule("captions");
    p?.unloadModule("cc");
  } catch {
    // Not loaded: nothing to switch off.
  }
}
type YouTubeApi = {
  Player: new (
    el: HTMLDivElement,
    options: Record<string, unknown>,
  ) => YouTubePlayer;
};
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let apiPromise: Promise<YouTubeApi> | undefined;
// Under the app's own 15s limit, so a stalled script fails as a load error.
const API_TIMEOUT = 12000;
/**
 * Loads YouTube's IFrame API once. If it fails or stalls, everything it
 * added is removed, so Try again starts the loader from scratch.
 */
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise)
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const fail = () => {
        clearTimeout(timer);
        apiPromise = undefined;
        document
          .querySelectorAll('script[src*="youtube.com/iframe_api"], #www-widgetapi-script')
          .forEach((node) => node.remove());
        if (!window.YT?.Player) window.YT = undefined;
        reject(new Error("Player script unavailable"));
      };
      const timer = setTimeout(fail, API_TIMEOUT);
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = fail;
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timer);
        resolve(window.YT!);
      };
      document.head.appendChild(script);
    });
  return apiPromise;
}
export default function Embed({
  videoId,
  height,
  startSeconds = 0,
  onEvent,
  ref,
}: PlayerProps) {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | undefined>(undefined);
  const ready = useRef(false);
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  }, [onEvent]);
  // App controls reach the provider's own player through its official API.
  useImperativeHandle(ref, () => ({
    command: (command) => {
      const p = player.current;
      if (!p || !ready.current) return;
      if (command.type === "play") p.playVideo();
      else if (command.type === "pause") p.pauseVideo();
      else if (command.type === "seek") p.seekTo(command.seconds, true);
      else if (command.type === "rate") p.setPlaybackRate(command.rate);
    },
    focus: () => holder.current?.querySelector("iframe")?.focus(),
  }));
  useEffect(() => {
    let disposed = false;
    let captionsChecked = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const duration = () => {
      try {
        return player.current?.getDuration() ?? 0;
      } catch {
        return 0;
      }
    };
    loadApi()
      .then((api) => {
        if (disposed || !holder.current) return;
        const target = document.createElement("div");
        holder.current.appendChild(target);
        player.current = new api.Player(target, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            start: startSeconds,
            controls: 1,
            playsinline: 1,
            rel: 0,
            cc_load_policy: 0,
            origin: window.location.origin,
          },
          // A player replaced by a new attempt (a retry, or a restart at the
          // account's saved place) can still report late. It must stay silent:
          // its "ready" would be taken as the new player's, and the new one
          // would then be told to play before it can.
          events: {
            onReady: () => {
              if (disposed) return;
              ready.current = true;
              captionsOff(player.current);
              callback.current({ type: "ready", duration: duration() });
            },
            onError: (e: { data: number }) => {
              if (!disposed) callback.current({ type: "error", code: e.data });
            },
            onStateChange: (e: { data: number }) => {
              if (disposed) return;
              if (e.data === 1 && !captionsChecked) {
                captionsChecked = true;
                captionsOff(player.current);
              }
              callback.current({
                type: "state",
                state: e.data,
                seconds: player.current?.getCurrentTime(),
                duration: duration(),
              });
            },
            onPlaybackRateChange: (e: { data: number }) => {
              if (!disposed) callback.current({ type: "rate", rate: e.data });
            },
          },
        });
        timer = setInterval(() => {
          // The provider only adds its methods once the player is ready.
          const p = player.current;
          if (!p || !ready.current) return;
          if (p.getPlayerState() === 1)
            callback.current({
              type: "state",
              state: 1,
              seconds: p.getCurrentTime(),
              duration: duration(),
            });
        }, 1000);
      })
      .catch(() => {
        if (!disposed) callback.current({ type: "error", code: 0 });
      });
    return () => {
      disposed = true;
      ready.current = false;
      if (timer) clearInterval(timer);
      player.current?.destroy();
      player.current = undefined;
    };
  }, [videoId, startSeconds]);
  return (
    <div
      ref={holder}
      style={{ width: "100%", height, minWidth: 200, background: "#000" }}
    />
  );
}
