import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DemoState = {
  signedIn: boolean;
  setSignedIn: (signedIn: boolean) => void;
};

const DemoContext = createContext<DemoState | null>(null);

// Deliberately memory-only. Account forms never put field values in this context.
export function DemoProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const value = useMemo(() => ({ signedIn, setSignedIn }), [signedIn]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo must be used inside DemoProvider.");
  return value;
}
