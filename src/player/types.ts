export type PlayerEvent =
  | { type: "ready" }
  | { type: "state"; state: number; seconds?: number }
  | { type: "error"; code: number };
export type PlayerProps = {
  videoId: string;
  height: number;
  startSeconds?: number;
  onEvent: (event: PlayerEvent) => void;
};
export function playerError(code: number) {
  switch (code) {
    case 100:
      return "This message is private, removed or unavailable.";
    case 101:
    case 150:
      return "The owner has disabled playback in other apps.";
    case 153:
      return "YouTube could not identify this player. Open this message on YouTube, or try a development build.";
    case 2:
      return "This video link could not be read.";
    case 5:
      return "This device could not start the YouTube player.";
    default:
      return "The player could not load. Check your connection and try again.";
  }
}
