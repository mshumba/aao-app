import { useEffect, useRef } from "react";
import { PlayerProps } from "./types";
type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
};
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
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise)
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        apiPromise = undefined;
        reject(new Error("Player script unavailable"));
      };
      window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
      document.head.appendChild(script);
    });
  return apiPromise;
}
export default function Embed({
  videoId,
  height,
  startSeconds = 0,
  onEvent,
}: PlayerProps) {
  const holder = useRef<HTMLDivElement>(null);
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    let disposed = false;
    let player: YouTubePlayer | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    loadApi()
      .then((api) => {
        if (disposed || !holder.current) return;
        const target = document.createElement("div");
        holder.current.appendChild(target);
        player = new api.Player(target, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            start: startSeconds,
            controls: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => callback.current({ type: "ready" }),
            onError: (e: { data: number }) =>
              callback.current({ type: "error", code: e.data }),
            onStateChange: (e: { data: number }) =>
              callback.current({
                type: "state",
                state: e.data,
                seconds: player?.getCurrentTime(),
              }),
          },
        });
        timer = setInterval(() => {
          if (player?.getPlayerState() === 1)
            callback.current({
              type: "state",
              state: 1,
              seconds: player.getCurrentTime(),
            });
        }, 1000);
      })
      .catch(() => {
        if (!disposed) callback.current({ type: "error", code: 0 });
      });
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      player?.destroy();
    };
  }, [videoId, startSeconds]);
  return (
    <div
      ref={holder}
      style={{ width: "100%", height, minWidth: 200, background: "#000" }}
    />
  );
}
