import { expect, test } from "@playwright/test";
import ts from "typescript";
import type { WatchProgress } from "../src/auth/types";
import type { EmbedHandle, PlayerCommand, PlayerEvent } from "../src/player/types";

// A signed-in viewer presses Watch before their account's progress has
// loaded, so their saved place arrives late. The real PlayerProvider runs
// here without React Native or a browser: a small hook host renders it, and
// a stand-in embed records the commands it sends to YouTube.

// Node's built-ins, typed here: the app's tsconfig leaves Node's types out.
type Fs = { readFileSync(path: string, encoding: "utf8"): string };
type Vm = {
  compileFunction(code: string, params: string[], options: { filename: string }): (...args: unknown[]) => void;
};
const builtin = (id: string) =>
  (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule(id);
const fs = builtin("node:fs") as Fs;
const vm = builtin("node:vm") as Vm;

type Sermon = { id: string; source: string };
type Session = {
  phase: string;
  resumedFrom: number;
  load: (sermon: Sermon, from?: number) => void;
  retry: () => void;
  close: () => void;
  startOver: () => void;
  onEvent: (event: PlayerEvent) => void;
  attach: (handle: EmbedHandle | null) => void;
};
type Playback = {
  seconds: number;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  pause: () => void;
};

const SERMON: Sermon = { id: "test-sermon", source: "https://www.youtube.com/watch?v=test-sermon" };
const SAVED: WatchProgress = {
  sermonId: SERMON.id,
  positionSeconds: 250,
  durationSeconds: 600,
  finished: false,
  updatedAt: "2026-10-16T10:00:00.000Z",
};

/**
 * Renders PlayerProvider with just enough React: state, refs, memos and
 * effects, re-rendering until nothing changes (`flush`). The account's
 * progress is still loading; each whenProgressReady() call waits on its own
 * answer, sent with `answer`. Timers never fire.
 */
function mountPlayer() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = false;
  let effects: (() => void)[] = [];
  const same = (a: unknown[] | undefined, b: unknown[]) =>
    !!a && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
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
    useEffect: (run: () => void | (() => void), deps: unknown[]) => {
      const i = cursor++;
      const before = slots[i] as { deps: unknown[]; cleanup?: void | (() => void) } | undefined;
      if (before && same(before.deps, deps)) return;
      const entry = { deps, cleanup: before?.cleanup };
      slots[i] = entry;
      effects.push(() => {
        entry.cleanup?.();
        entry.cleanup = run();
      });
    },
  };

  const account = { user: { id: "local:member@example.com" } as { id: string } | null };
  const answers: ((items: WatchProgress[] | null) => void)[] = [];
  const progress = {
    progress: [],
    progressReady: false,
    progressFor: () => null,
    whenProgressReady: () =>
      new Promise<WatchProgress[] | null>((resolve) => {
        answers.push(resolve);
      }),
    saveProgress: () => {},
  };
  const native = {
    Platform: { OS: "ios" },
    AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
    AccessibilityInfo: { announceForAccessibility() {} },
    Linking: { openURL: () => Promise.resolve() },
  };

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
    const imports: Record<string, () => unknown> = {
      react: () => React,
      "react/jsx-runtime": () => ({
        jsx: (type: unknown, props: unknown) => ({ type, props }),
        jsxs: (type: unknown, props: unknown) => ({ type, props }),
      }),
      "react-native": () => native,
      "../auth/AccountProvider": () => ({ useAccount: () => account, useWatchProgress: () => progress }),
      "../learning/completeDay": () => ({ useCompleteDay: () => () => false }),
      "./progress": () => load("player/progress.ts"),
      "./types": () => load("player/types.ts"),
    };
    const stub = (name: string) => {
      const found = imports[name];
      // A new import in the provider needs a stand-in here.
      if (!found) throw new Error(`player-resume.spec: no stand-in for "${name}" (${file})`);
      return found();
    };
    vm.compileFunction(code, ["module", "exports", "require", "setTimeout", "clearTimeout"], { filename })(
      mod,
      mod.exports,
      stub,
      () => 0,
      () => {},
    );
    return mod.exports;
  };
  const PlayerProvider = load("player/PlayerProvider.tsx").PlayerProvider as (props: {
    children: null;
  }) => { props: { value: Session; children: { props: { value: Playback } } } };

  const player = {
    session: null as unknown as Session,
    playback: null as unknown as Playback,
    /** What the app asked YouTube to do, in order: "play", "seek:250". */
    commands: [] as string[],
    account,
    flush() {
      for (let renders = 0; ; renders++) {
        if (renders > 50) throw new Error("PlayerProvider kept re-rendering");
        dirty = false;
        cursor = 0;
        effects = [];
        const tree = PlayerProvider({ children: null });
        player.session = tree.props.value;
        player.playback = tree.props.children.props.value;
        for (const effect of effects) effect();
        if (!dirty) return;
      }
    },
    /** The `n`th progress request (from 0) answers with the account's saved places. */
    async answer(items: WatchProgress[] | null, n = answers.length - 1) {
      answers[n](items);
      // Let the provider's .then run, then render what it changed.
      await new Promise((resolve) => setTimeout(resolve, 0));
      player.flush();
    },
    requests: () => answers.length,
  };
  player.flush();
  player.session.attach({
    command: (c: PlayerCommand) =>
      player.commands.push(c.type === "seek" ? `seek:${c.seconds}` : c.type === "rate" ? `rate:${c.rate}` : c.type),
  });
  return player;
}

type Player = ReturnType<typeof mountPlayer>;

/** Watch, the player becomes ready, and the sermon plays four seconds in. */
function watchFourSeconds(player: Player, from?: number) {
  player.session.load(SERMON, from);
  player.flush();
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  player.session.onEvent({ type: "state", state: 1, seconds: (from ?? 0) + 4, duration: 600 });
  player.flush();
}

test("a saved place that arrives late still resumes when the viewer hasn't moved", async () => {
  const player = mountPlayer();
  watchFourSeconds(player);
  expect(player.commands).toEqual(["play"]);
  await player.answer([SAVED]);
  expect(player.commands).toEqual(["play", "seek:250"]);
  expect(player.playback.seconds).toBe(250);
  expect(player.session.resumedFrom).toBe(250);
});

test("a saved place that arrives while the player loads is moved to once it's ready", async () => {
  const player = mountPlayer();
  player.session.load(SERMON);
  player.flush();
  // A second tap on Watch while it loads is the same load, still waiting.
  player.session.load(SERMON);
  player.flush();
  await player.answer([SAVED], 0);
  expect(player.commands).toEqual([]);
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  expect(player.commands).toEqual(["seek:250", "play"]);
  expect(player.playback.seconds).toBe(250);
});

test("a saved place that arrives after the viewer seeks back to the start leaves them there", async () => {
  const player = mountPlayer();
  watchFourSeconds(player);
  player.playback.seek(0);
  player.flush();
  await player.answer([SAVED]);
  expect(player.commands).toEqual(["play", "seek:0"]);
  expect(player.playback.seconds).toBe(0);
  expect(player.session.resumedFrom).toBe(0);
});

test("skipping back, starting over or closing first also keeps a late saved place from moving them", async () => {
  // Each action, and where it leaves the clock (closing doesn't move it).
  const actions: Record<string, [(player: Player) => void, number]> = {
    "skip back": [(player) => player.playback.skip(-15), 0],
    "start over": [(player) => player.session.startOver(), 0],
    close: [(player) => player.session.close(), 4],
  };
  for (const [name, [act, seconds]] of Object.entries(actions)) {
    const player = mountPlayer();
    watchFourSeconds(player);
    act(player);
    player.flush();
    const before = [...player.commands];
    await player.answer([SAVED]);
    expect(player.commands, name).toEqual(before);
    expect(player.playback.seconds, name).toBe(seconds);
    expect(player.session.resumedFrom, name).toBe(0);
  }
});

test("a seek while the player loads wins over a saved place waiting for it to be ready", async () => {
  const player = mountPlayer();
  player.session.load(SERMON);
  player.flush();
  await player.answer([SAVED]);
  player.playback.seek(0);
  player.flush();
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  expect(player.commands).not.toContain("seek:250");
  expect(player.playback.seconds).toBe(0);
});

test("an earlier load's late answer can't move a later load of the same sermon", async () => {
  const player = mountPlayer();
  watchFourSeconds(player);
  player.session.close();
  player.flush();
  // Opened again at a place of its own (a moment, a shared time).
  watchFourSeconds(player, 5);
  expect(player.requests()).toBe(1);
  await player.answer([SAVED], 0);
  expect(player.commands).toEqual(["play", "play"]);
  expect(player.playback.seconds).toBe(9);
});

test("a sermon loaded again with no place resumes from its own request, not the earlier one's", async () => {
  const player = mountPlayer();
  watchFourSeconds(player);
  player.session.close();
  player.flush();
  watchFourSeconds(player);
  expect(player.requests()).toBe(2);
  await player.answer([{ ...SAVED, positionSeconds: 400 }], 0);
  expect(player.commands).toEqual(["play", "play"]);
  await player.answer([SAVED], 1);
  expect(player.commands).toEqual(["play", "play", "seek:250"]);
  expect(player.playback.seconds).toBe(250);
});

test("another viewer signing in before the saved place arrives keeps it from moving them", async () => {
  const player = mountPlayer();
  watchFourSeconds(player);
  player.account.user = { id: "local:other@example.com" };
  player.flush();
  await player.answer([SAVED]);
  expect(player.commands).not.toContain("seek:250");
  expect(player.playback.seconds).toBe(4);
});

test("a late saved place that fails to load leaves playback alone", async () => {
  const player = mountPlayer();
  watchFourSeconds(player);
  await player.answer(null);
  expect(player.commands).toEqual(["play"]);
  expect(player.playback.seconds).toBe(4);
});
