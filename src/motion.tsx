import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo } from "react-native";

const ReducedMotion = createContext(true);

/**
 * The system Reduce Motion setting, kept live. Reanimated's own hook reads it
 * once at launch, so the stack and press feedback both read this instead.
 * Starts reduced until the setting resolves.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return (
    <ReducedMotion.Provider value={reduced}>{children}</ReducedMotion.Provider>
  );
}

export function useReducedMotion() {
  return useContext(ReducedMotion);
}
