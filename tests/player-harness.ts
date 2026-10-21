import { test } from "@playwright/test";
import ts from "typescript";
import type { WatchProgress } from "../src/auth/types";
import type { EmbedHandle, PlayerCommand, PlayerEvent } from "../src/player/types";

// Runs the app's own source in Node, without React Native or a browser: a
// file is compiled the app's way and given stand-ins for what it imports,
// and a small hook host renders components and hooks. Used by the player's
// node-run specs (player-resume, player-engine).

// Node's built-ins, typed here: the app's tsconfig leaves Node's types out.
type Fs = { readFileSync(path: string, encoding: "utf8"): string };
type Vm = {
  compileFunction(code: string, params: string[], options: { filename: string }): (...args: unknown[]) => void;
};
const builtin = (id: string) =>
  (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule(id);
const fs = builtin("node:fs") as Fs;
const vm = builtin("node:vm") as Vm;

export type FakeTimers = ReturnType<typeof fakeTimers>;

/** Timers that only run when a test says time has passed (`fire`). */
export function fakeTimers() {
  let next = 1;
  const queue = new Map<number, { run: () => void; ms: number }>();
  return {
    setTimeout: (run: () => void, ms = 0) => {
      const id = next++;
      queue.set(id, { run, ms });
      return id;
    },
    clearTimeout: (id: number) => {
      queue.delete(id);
    },
    /** Runs the timers set for `ms` (every timer when it's left out), as if that long had passed. */
    fire(ms?: number) {
      for (const [id, timer] of Array.from(queue))
        if (ms == null || timer.ms === ms) {
          queue.delete(id);
          timer.run();
        }
    },
    /** How many timers set for `ms` (or at all) are still waiting. */
    waiting: (ms?: number) => Array.from(queue.values()).filter((timer) => ms == null || timer.ms === ms).length,
  };
}

type Stubs = Record<string, (load: (file: string) => Record<string, unknown>) => unknown>;

/**
 * Loads files under src/ (TypeScript and JSX, compiled the app's way). Each
 * import gets the stand-in named for it in `stubs`, which may load another
 * real file; an import with none fails the test, so a new import needs one.
 * Timers in the loaded files are `timers`.
 */
export function sourceLoader(stubs: Stubs, timers: FakeTimers = fakeTimers()) {
  const src = `${test.info().project.testDir}/../src`;
  const loaded = new Map<string, Record<string, unknown>>();
  const load = (file: string): Record<string, unknown> => {
    const done = loaded.get(file);
    if (done) return done;
    const filename = `${src}/${file}`;
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const mod = { exports: {} as Record<string, unknown> };
    loaded.set(file, mod.exports);
    const stub = (name: string) => {
      const found = stubs[name];
      if (!found) throw new Error(`harness: no stand-in for "${name}" (${file})`);
      return found(load);
    };
    vm.compileFunction(code, ["module", "exports", "require", "setTimeout", "clearTimeout"], { filename })(
      mod,
      mod.exports,
      stub,
      timers.setTimeout,
      timers.clearTimeout,
    );
    return mod.exports;
  };
  return load;
}

/** JSX as plain objects, so a test can read what a component rendered. */
export const jsxRuntime = {
  jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }),
};

/**
 * Just enough React to run hooks: state, refs, memos, effects (layout
 * effects alike) and imperative handles. `flush` renders again and again
 * until nothing changes, running effects after each render.
 */
export function hookHost() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = false;
  let effects: (() => void)[] = [];
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const slot = <T>(init: () => T) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = init();
    return [slots[i] as T, i] as const;
  };
  const memo = <T>(make: () => T, deps: unknown[]) => {
    const [kept, i] = slot(() => ({ value: make(), deps }));
    if (same(kept.deps, deps)) return kept.value;
    slots[i] = { value: make(), deps };
    return (slots[i] as typeof kept).value;
  };
  const effect = (run: () => void | (() => void), deps?: unknown[]) => {
    const i = cursor++;
    const before = slots[i] as { deps?: unknown[]; cleanup?: void | (() => void) } | undefined;
    if (before && same(before.deps, deps)) return;
    const entry = { deps, cleanup: before?.cleanup };
    slots[i] = entry;
    effects.push(() => {
      entry.cleanup?.();
      entry.cleanup = run();
    });
  };
  const React = {
    createContext: () => ({ Provider: "Provider" }),
    useContext: () => null,
    useRef: <T>(value: T) => slot(() => ({ current: value }))[0],
    useState: <T>(initial: T | (() => T)) => {
      const [value, i] = slot(() => (typeof initial === "function" ? (initial as () => T)() : initial));
      const set = (next: T | ((value: T) => T)) => {
        const now = slots[i] as T;
        const value = typeof next === "function" ? (next as (value: T) => T)(now) : next;
        if (Object.is(now, value)) return;
        slots[i] = value;
        dirty = true;
      };
      return [value, set] as const;
    },
    useMemo: memo,
    useCallback: <T>(fn: T, deps: unknown[]) => memo(() => fn, deps),
    useEffect: effect,
    useLayoutEffect: effect,
    useImperativeHandle: <T>(
      ref: { current: T | null } | ((value: T | null) => void) | null | undefined,
      make: () => T,
      deps?: unknown[],
    ) =>
      effect(() => {
        if (typeof ref === "function") ref(make());
        else if (ref) ref.current = make();
      }, deps),
  };
  return {
    React,
    flush<T>(render: () => T): T {
      for (let renders = 0; ; renders++) {
        if (renders > 50) throw new Error("harness: kept re-rendering");
        dirty = false;
        cursor = 0;
        effects = [];
        const tree = render();
        for (const effect of effects) effect();
        if (!dirty) return tree;
      }
    },
    /** Runs every effect's cleanup, as unmounting would. */
    unmount() {
      for (const entry of slots)
        if (entry && typeof entry === "object" && "cleanup" in entry)
          (entry as { cleanup?: void | (() => void) }).cleanup?.();
    },
  };
}

export type HarnessSermon = { id: string; source: string };
export type HarnessSession = {
  engine: "native" | "youtube" | null;
  phase: string;
  error: number | null;
  attempt: number;
  start: number;
  resumedFrom: number;
  load: (sermon: HarnessSermon, from?: number) => void;
  retry: () => void;
  close: () => void;
  startOver: () => void;
  watchOnYouTube: () => void;
  onEvent: (event: PlayerEvent) => void;
  attach: (handle: EmbedHandle | null) => void;
};
export type HarnessPlayback = {
  state: number;
  seconds: number;
  status: string;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  pause: () => void;
  toggle: () => void;
};

export type MountOptions = {
  /** Whether sermons are on R2: known straight away, or "ask" (answered by answerHls). */
  hls?: boolean | "ask";
  /** Platform.OS. */
  platform?: "ios" | "android" | "web";
};

/**
 * Renders the real PlayerProvider. The account's progress hasn't been read
 * from the server yet; `copy` is this device's copy of it from an earlier
 * launch, shown meanwhile. Each whenProgressReady() call waits on its own
 * answer, sent with `answer`. A stand-in engine records the commands sent to
 * it ("play", "seek:250"). Timers run only when a test fires them.
 */
export function mountPlayer(copy: WatchProgress[] = [], { hls = false, platform = "ios" }: MountOptions = {}) {
  const host = hookHost();
  const timers = fakeTimers();
  const account = { user: { id: "local:member@example.com" } as { id: string } | null };
  const answers: ((items: WatchProgress[] | null) => void)[] = [];
  const saves: number[] = [];
  const progress = {
    progress: copy,
    progressReady: false,
    progressFor: (id: string) => copy.find((item) => item.sermonId === id) ?? null,
    whenProgressReady: () =>
      new Promise<WatchProgress[] | null>((resolve) => {
        answers.push(resolve);
      }),
    saveProgress: (item: { positionSeconds: number }) => {
      saves.push(item.positionSeconds);
    },
  };
  const appState: ((state: string) => void)[] = [];
  const opened: string[] = [];
  const native = {
    Platform: { OS: platform },
    AppState: {
      currentState: "active",
      addEventListener: (_event: string, listener: (state: string) => void) => {
        appState.push(listener);
        return { remove: () => appState.splice(appState.indexOf(listener), 1) };
      },
    },
    AccessibilityInfo: { announceForAccessibility() {} },
    Linking: {
      openURL: (url: string) => {
        opened.push(url);
        return Promise.resolve();
      },
    },
  };
  let onR2 = hls;
  const hlsAsks: ((has: boolean) => void)[] = [];
  const load = sourceLoader(
    {
      react: () => host.React,
      "react/jsx-runtime": () => jsxRuntime,
      "react-native": () => native,
      "../auth/AccountProvider": () => ({ useAccount: () => account, useWatchProgress: () => progress }),
      "../learning/completeDay": () => ({ useCompleteDay: () => () => false }),
      "./progress": (load) => load("player/progress.ts"),
      "./types": (load) => load("player/types.ts"),
      "./youtube": (load) => load("player/youtube.ts"),
      // The real engine choice, with R2's answers from the test.
      "./media": (load) => ({
        ...load("player/media.ts"),
        knownHls: () => (onR2 === "ask" ? undefined : onR2),
        hasHls: () =>
          onR2 === "ask" ? new Promise<boolean>((resolve) => hlsAsks.push(resolve)) : Promise.resolve(onR2),
        prefetchHls: () => {},
      }),
    },
    timers,
  );
  const PlayerProvider = load("player/PlayerProvider.tsx").PlayerProvider as (props: {
    children: null;
  }) => { props: { value: HarnessSession; children: { props: { value: HarnessPlayback } } } };

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const player = {
    session: null as unknown as HarnessSession,
    playback: null as unknown as HarnessPlayback,
    /** What the app asked the engine to do, in order: "play", "seek:250". */
    commands: [] as string[],
    /** The places saved to the account, in order. */
    saves,
    account,
    timers,
    /** URLs opened outside the app. */
    opened,
    flush() {
      const tree = host.flush(() => PlayerProvider({ children: null }));
      player.session = tree.props.value;
      player.playback = tree.props.children.props.value;
    },
    /** The `n`th progress request (from 0) answers with the account's saved places. */
    async answer(items: WatchProgress[] | null, n = answers.length - 1) {
      answers[n](items);
      // Let the provider's .then run, then render what it changed.
      await tick();
      player.flush();
    },
    requests: () => answers.length,
    /** Whether sermons are on R2 from now on. */
    setHls(next: boolean | "ask") {
      onR2 = next;
    },
    /** Answers the oldest question still waiting on whether a sermon is on R2. */
    async answerHls(has: boolean) {
      hlsAsks.shift()?.(has);
      await tick();
      player.flush();
    },
    /** The viewer leaves the app. */
    background() {
      native.AppState.currentState = "background";
      for (const listener of [...appState]) listener("background");
      player.flush();
    },
  };
  player.flush();
  player.session.attach({
    command: (c: PlayerCommand) =>
      player.commands.push(c.type === "seek" ? `seek:${c.seconds}` : c.type === "rate" ? `rate:${c.rate}` : c.type),
  });
  return player;
}

export type MountedPlayer = ReturnType<typeof mountPlayer>;

/** Watch (at `from`, if given), the player becomes ready, and the sermon plays four seconds in. */
export function playFourSeconds(player: MountedPlayer, sermon: HarnessSermon, from?: number) {
  player.session.load(sermon, from);
  player.flush();
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  player.session.onEvent({ type: "state", state: 1, seconds: (from ?? 0) + 4, duration: 600 });
  player.flush();
}
