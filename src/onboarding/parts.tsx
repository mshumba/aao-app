import { css } from "react-native-reanimated";

/** Entrances for the flow's two authored moments (welcome, all set). */
export const motion = {
  /** Text arriving: up 8pt as it fades in. */
  rise: css.keyframes({
    from: { opacity: 0, transform: [{ translateY: 8 }] },
    to: { opacity: 1, transform: [{ translateY: 0 }] },
  }),
  /** Artwork settling into place. */
  settle: css.keyframes({
    from: { opacity: 0, transform: [{ scale: 0.96 }] },
    to: { opacity: 1, transform: [{ scale: 1 }] },
  }),
  /** A sheet arriving from below the screen's edge (the web sign-up sheet). */
  sheet: css.keyframes({
    from: { opacity: 0, transform: [{ translateY: 48 }] },
    to: { opacity: 1, transform: [{ translateY: 0 }] },
  }),
  /** What all of these become under Reduce Motion, and the sheet's scrim. */
  fade: css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } }),
};
