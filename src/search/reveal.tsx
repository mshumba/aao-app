import { createContext, memo, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, { cubicBezier, type CSSAnimationKeyframes } from "react-native-reanimated";

/**
 * Results arriving: the whole set rises in once (250ms, strong ease-out),
 * with the first four moment cards 50ms apart.
 *
 * The list is virtualized, so rows don't animate themselves on mount (a row
 * scrolled away and back would play it again). Every row of one result set
 * keeps to a single clock instead, started as the set arrives: a row drawn
 * while it runs takes its place in the one movement, and a row drawn after
 * it ends is simply there. A row of a set that's been replaced (another
 * search on its way) is hidden until it goes.
 *
 * The movement is a CSS animation on the UI thread, ending on the row's
 * plain style: nothing is handed back to React as it settles, unlike a
 * settled animated style, which Reanimated redraws a second or so later
 * (every row of the set, on iOS). A row works out its part in the movement
 * once, as it's drawn for its set.
 *
 * Under Reduce Motion only the opacity changes.
 */

const DURATION = 250;
const STAGGER = 50;
/** Moment cards that stagger; later ones come with the fourth. */
const STAGGERED = 4;
const RISE = 10;
const ease = cubicBezier(0.23, 1, 0.32, 1);
const rise = {
  from: { opacity: 0, transform: [{ translateY: RISE }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
} satisfies CSSAnimationKeyframes;
const fade = { from: { opacity: 0 }, to: { opacity: 1 } } satisfies CSSAnimationKeyframes;
const hidden = { opacity: 0 };

/**
 * When the set's movement started, outside React state: a row reads it as
 * it's drawn, and starting it redraws nothing.
 */
class Clock {
  private id = "";
  private at = 0;

  start(id: string) {
    this.id = id;
    this.at = performance.now();
  }

  /** How long set `id` has been moving: none until its first rows are on the screen. */
  elapsed(id: string) {
    return id === this.id ? performance.now() - this.at : 0;
  }
}

/** The set the rows belong to (empty for none), and its clock. */
type ResultSet = { id: string; reduced: boolean; clock: Clock };

const RevealContext = createContext<ResultSet | null>(null);

/**
 * Starts the clock when a new result set (`id`, empty for none) arrives.
 * Pass the value to RevealProvider around the list.
 */
export function useResultsReveal(id: string, reduced: boolean): ResultSet {
  const [clock] = useState(() => new Clock());
  useEffect(() => {
    if (id) clock.start(id);
  }, [id, clock]);
  return useMemo(() => ({ id, reduced, clock }), [id, reduced, clock]);
}

export const RevealProvider = RevealContext.Provider;

/**
 * A row of the results. `order` staggers a moment card (0 for the first);
 * everything else moves with the first.
 */
export const Reveal = memo(function Reveal({
  order = 0,
  style,
  children,
}: {
  order?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reveal = useContext(RevealContext);
  if (!reveal) throw new Error("Reveal needs a RevealProvider");
  const { id, reduced, clock } = reveal;
  const delay = Math.min(order, STAGGERED - 1) * STAGGER;
  // The row's part in its set's movement: from its start (a row drawn as
  // the set arrives), part way through (a row drawn while it runs), or
  // none (after it). Held while it plays, so a redraw never restarts it.
  const motion = useMemo(() => {
    if (!id) return hidden;
    const start = delay - clock.elapsed(id);
    if (start <= -DURATION) return null;
    return {
      animationName: reduced ? fade : rise,
      animationDuration: DURATION,
      animationDelay: start,
      animationTimingFunction: ease,
      animationFillMode: "backwards",
    } as const;
  }, [id, reduced, clock, delay]);
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
});
