import { createContext, memo, useContext, useEffect, useMemo, type ReactNode } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Results arriving: the whole set rises in once (250ms, strong ease-out),
 * with the first four moment cards 50ms apart.
 *
 * The list is virtualized, so rows don't animate themselves on mount (a row
 * scrolled away and back would play it again). Every row of one result set
 * reads a single clock instead: a row drawn while it runs takes its place in
 * the one movement, and a row drawn after it ends is simply there. A row
 * belongs to the set named by `id`; until that set's clock starts it stays
 * hidden, so nothing flashes before the movement begins.
 *
 * Under Reduce Motion only the opacity changes.
 */

const DURATION = 250;
const STAGGER = 50;
/** Moment cards that stagger; later ones come with the fourth. */
const STAGGERED = 4;
const TOTAL = DURATION + STAGGER * (STAGGERED - 1);
const RISE = 10;
const ease = Easing.bezierFn(0.23, 1, 0.32, 1);

type Clock = {
  /** The set whose clock is running (or has run). */
  landed: SharedValue<string>;
  /** Milliseconds since that set arrived, up to TOTAL. */
  clock: SharedValue<number>;
  id: string;
  reduced: boolean;
};

const RevealContext = createContext<Clock | null>(null);

/**
 * Starts the clock when a new result set (`id`, empty for none) arrives.
 * Pass the value to RevealProvider around the list.
 */
export function useResultsReveal(id: string, reduced: boolean): Clock {
  const landed = useSharedValue("");
  const clock = useSharedValue(TOTAL);
  useEffect(() => {
    if (!id) return;
    landed.set(id);
    clock.set(0);
    clock.set(withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear }));
  }, [id, landed, clock]);
  return useMemo(() => ({ landed, clock, id, reduced }), [landed, clock, id, reduced]);
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
  const { landed, clock, id, reduced } = reveal;
  const delay = Math.min(order, STAGGERED - 1) * STAGGER;
  const animated = useAnimatedStyle(() => {
    const ms = landed.get() === id ? clock.get() : 0;
    const t = ease(Math.min(1, Math.max(0, (ms - delay) / DURATION)));
    return { opacity: t, transform: [{ translateY: reduced ? 0 : (1 - t) * RISE }] };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
});
