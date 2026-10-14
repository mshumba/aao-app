import type { Ref } from "react";

export type PlayerEvent =
  | { type: "ready"; duration?: number }
  | { type: "state"; state: number; seconds?: number; duration?: number }
  | { type: "rate"; rate: number }
  | { type: "error"; code: number };

/** Commands sent to the provider's own player through the official IFrame API. */
export type PlayerCommand =
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; seconds: number }
  | { type: "rate"; rate: number };

export type EmbedHandle = {
  command: (command: PlayerCommand) => void;
  /** Moves keyboard focus into the provider's player (web). */
  focus: () => void;
};

/** App-side code (not YouTube's) for a player whose page was shut down by the system. */
export const PLAYER_STOPPED = -1;

export type PlayerProps = {
  videoId: string;
  height: number;
  startSeconds?: number;
  onEvent: (event: PlayerEvent) => void;
  ref?: Ref<EmbedHandle>;
};

export function playerError(code: number) {
  switch (code) {
    case 100:
      return "This sermon is private or has been removed from YouTube. Choose another sermon below.";
    case 101:
    case 150:
      return "This sermon can only be watched on YouTube.";
    case 153:
      return "This sermon can’t play in the app right now. You can still watch it on YouTube.";
    case 2:
      return "This sermon’s video link isn’t working. You can try it on YouTube.";
    case 5:
      return "The player couldn’t start on this device. Try again, or watch on YouTube.";
    case PLAYER_STOPPED:
      return "The player stopped. Try again to continue where you left off.";
    default:
      return "The player didn’t load. Check your connection and try again.";
  }
}
/** Only connection and device errors can be fixed by loading the player again. */
export function canRetry(code: number) {
  return ![2, 100, 101, 150, 153].includes(code);
}
/** A removed or private video won't play on YouTube either. */
export function canWatchOnYouTube(code: number) {
  return code !== 100;
}
