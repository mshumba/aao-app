/// <reference types="node" />
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { fixtureDays, fixtureNeeds, fixturePaths, fixtureTopics } from "../src/learning/fixtures";
import type { Need, Path, PathDay, Topic } from "../src/learning/types";

// These regressions need pending remote requests, which the local browser
// backend completes immediately. Execute the real action/refresh source with
// deferred transports and a small state host. No copied mutation logic, network,
// React renderer, or timing threshold is involved. UI/render behavior remains
// covered by the existing Home and Search browser tests.
const root = process.env.AAO_RESPONSIVENESS_SOURCE_ROOT ?? resolve(__dirname, "..");
function source(file: string) {
  const path = resolve(root, file);
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function declaration(file: ts.SourceFile, name: string) {
  let found: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (!found && ts.isVariableDeclaration(node) && node.name.getText(file) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error(`Missing ${name} in ${file.fileName}`);
  return `const ${found.getText(file)};`;
}
function fn(file: ts.SourceFile, name: string) {
  const found = file.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  if (!found?.body) throw new Error(`Missing ${name} in ${file.fileName}`);
  return found;
}
function evaluate<T>(body: string, result: string, host: Record<string, unknown>): T {
  const context = { ...host, subject: undefined };
  const code = ts.transpileModule(`${body}\nglobalThis.subject = ${result};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, context);
  return context.subject as T;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settled() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function saveHost(screen: "Home" | "Search") {
  let owner: string | null = "account-a";
  const writes: { owner: string; id: string; on: boolean; job: ReturnType<typeof deferred<void>> }[] = [];
  const toasts: string[] = [];
  const savedByOwner = new Map<string, Set<string>>();
  const refs: { current: unknown }[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const host = {
    useRef: (value: unknown) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => void) => effects.push(effect),
    useLayoutEffect: (effect: () => void) => effects.push(effect),
    useGo: () => ({}),
    useGate: () => ({ require: () => owner !== null }),
    useAccount: () => ({ user: owner ? { id: owner } : null }),
    useToast: () => (message: string) => toasts.push(message),
    useSaved: () => {
      const userId = owner;
      const saved = savedByOwner.get(userId ?? "guest") ?? new Set<string>();
      savedByOwner.set(userId ?? "guest", saved);
      return {
        isSaved: (id: string) => saved.has(id),
        setSaved: (id: string, on: boolean) => {
          if (!userId) throw new Error("Not signed in");
          if (on) saved.add(id); else saved.delete(id);
          const job = deferred<void>();
          writes.push({ owner: userId, id, on, job });
          return job.promise;
        },
      };
    },
    Platform: { OS: "ios" },
    Haptics: { ImpactFeedbackStyle: { Light: "light" }, impactAsync: async () => {} },
  };
  let body: string;
  if (screen === "Home") {
    const file = source("src/home/actions.ts");
    body = fn(file, "useSermonActions").getText(file).replace(/^export /, "") +
      "\nfunction render() { return useSermonActions().toggleSave; }";
  } else {
    const file = source("src/search/SearchScreen.tsx");
    // Select the complete save path and its actual account/ref update effect;
    // unrelated Search UI/data hooks are not needed by this transport test.
    const names = new Set(["go", "gate", "saved", "userId", "toast", "latest", "saving", "toggleSave"]);
    const statements = fn(file, "SearchView").body!.statements.filter((node) =>
      (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => names.has(d.name.getText(file)))) ||
      (ts.isExpressionStatement(node) && node.getText(file).includes("latest.current =")),
    );
    body = `function render() { ${statements.map((s) => s.getText(file)).join("\n")} return toggleSave; }`;
  }
  const render = evaluate<() => (input: unknown) => Promise<void>>(body, "render", host);
  function rerender(nextOwner = owner) {
    owner = nextOwner;
    cursor = 0;
    effects = [];
    const callback = render();
    effects.forEach((effect) => effect());
    return callback;
  }
  // Keep the first-render callback, as memoised cards do. Account changes must
  // reach it through the application's actual latest-ref update.
  const toggle = rerender();
  return {
    press: (id: string) => toggle(screen === "Home" ? id : { youtubeId: id }),
    rerender, writes, toasts,
  };
}

for (const screen of ["Home", "Search"] as const) {
  test(`${screen}: another sermon saves while the first waits, but a duplicate does not`, async () => {
    const app = saveHost(screen);
    const a = app.press("sermon-a");
    app.rerender();
    await app.press("sermon-a");
    const b = app.press("sermon-b");
    expect(app.writes.map(({ id }) => id)).toEqual(["sermon-a", "sermon-b"]);
    app.writes[0].job.resolve();
    await a;
    const undoA = app.press("sermon-a");
    expect(app.writes[2]).toMatchObject({ id: "sermon-a", on: false });
    await app.press("sermon-b");
    expect(app.writes).toHaveLength(3);
    app.writes[1].job.resolve();
    app.writes[2].job.resolve();
    await Promise.all([b, undoA]);
  });

  test(`${screen}: account switches preserve each account's pending saves`, async () => {
    const app = saveHost(screen);
    const a = app.press("same-sermon");
    app.rerender("account-b");
    const b = app.press("same-sermon");
    expect(app.writes.map(({ owner }) => owner)).toEqual(["account-a", "account-b"]);
    app.rerender("account-a");
    await app.press("same-sermon");
    expect(app.writes).toHaveLength(2);
    app.rerender("account-b");
    app.writes[0].job.resolve();
    await a;
    expect(app.toasts).toEqual([]);
    await app.press("same-sermon");
    expect(app.writes).toHaveLength(2); // A's settlement must not unlock B.
    app.writes[1].job.resolve();
    await b;
    expect(app.toasts).toEqual(["Saved"]);
  });

  test(`${screen}: a failed save can retry without unlocking another pending sermon`, async () => {
    const app = saveHost(screen);
    const a = app.press("sermon-a");
    const b = app.press("sermon-b");
    expect(app.writes).toHaveLength(2);
    app.writes[0].job.reject(new Error("offline"));
    await a;
    expect(app.toasts).toEqual(["Couldn’t save. Check your connection."]);
    const retryA = app.press("sermon-a");
    await app.press("sermon-b");
    expect(app.writes.map(({ id }) => id)).toEqual(["sermon-a", "sermon-b", "sermon-a"]);
    app.writes[1].job.resolve();
    app.writes[2].job.resolve();
    await Promise.all([b, retryA]);
  });

  test(`${screen}: a guest save still goes through the account gate`, async () => {
    const app = saveHost(screen);
    app.rerender(null);
    await app.press("sermon-a");
    expect(app.writes).toEqual([]);
    expect(app.toasts).toEqual([]);
  });
}

type NeedsState = { needs: Need[]; loading: boolean };
type TopicsState = { topics: Topic[]; loading: boolean };
type PathState = { paths: Path[]; days: PathDay[]; loading: boolean; error: boolean };
const freshNeeds = fixtureNeeds.slice(0, 2);
const freshTopics = fixtureTopics.slice(0, 3);
const freshPaths = { paths: fixturePaths.slice(0, 1), days: fixtureDays.filter((d) => d.pathId === fixturePaths[0].id) };
const fresh = { needs: freshNeeds, topics: freshTopics, paths: freshPaths };
const empty = { needs: [], topics: [], paths: { paths: [], days: [] } };
const RESOURCES = ["needs", "topics", "paths"] as const;
type Resource = (typeof RESOURCES)[number];
const KEY: Record<Resource, string> = {
  needs: "aao.learning.needs.v1",
  topics: "aao.learning.topics.v1",
  paths: "aao.learning.paths.v2",
};
const others = (one: Resource) => RESOURCES.filter((r) => r !== one);
type Initial = { needs: NeedsState; topics: TopicsState; paths: PathState };
const cached = (): Initial => ({
  needs: { needs: freshNeeds, loading: false },
  topics: { topics: freshTopics, loading: false },
  paths: { ...freshPaths, loading: false, error: false },
});
function refreshHost(initial?: Initial, local = false) {
  const state = {
    needs: initial?.needs ?? { needs: [], loading: true },
    topics: initial?.topics ?? { topics: [], loading: true },
    paths: initial?.paths ?? { paths: [], days: [], loading: true, error: false },
  };
  const requests = {
    needs: deferred<Need[]>(),
    topics: deferred<Topic[]>(),
    paths: deferred<{ paths: Path[]; days: PathDay[] }>(),
  };
  const cache = new Map<string, { at: number; data: unknown }>();
  const pathUpdates: PathState[] = [];
  const called: string[] = [];
  const file = source("src/learning/LearningProvider.tsx");
  const refresh = evaluate<() => Promise<void>>(
    ["same", "KEYS", "revalidate"].map((name) => declaration(file, name)).join("\n"), "revalidate", {
      local, lastFetch: { current: 0 }, useCallback: (callback: unknown) => callback,
      fetchNeeds: () => { called.push("needs"); return requests.needs.promise; },
      fetchTopics: () => { called.push("topics"); return requests.topics.promise; },
      fetchPaths: () => { called.push("paths"); return requests.paths.promise; },
      setNeeds: (update: (was: NeedsState) => NeedsState) => { state.needs = update(state.needs); },
      setTopics: (update: (was: TopicsState) => TopicsState) => { state.topics = update(state.topics); },
      setPathData: (update: (was: PathState) => PathState) => { state.paths = update(state.paths); pathUpdates.push(state.paths); },
      writeJSON: (key: string, value: { at: number; data: unknown }) => { cache.set(key, value); },
    },
  );
  /** Answers one resource's request. */
  const answer = (one: Resource, data: unknown = fresh[one]) =>
    (requests[one] as { resolve: (value: unknown) => void }).resolve(data);
  const fail = (one: Resource) => requests[one].reject(new Error("offline"));
  return { refresh, answer, fail, cache, called, pathUpdates, state };
}

for (const first of RESOURCES) {
  test(`refresh: ${first} publishes while the others are still pending`, async () => {
    const app = refreshHost();
    let finished = false;
    const job = app.refresh().then(() => { finished = true; });
    expect(app.called).toEqual(["needs", "topics", "paths"]);
    app.answer(first);
    await settled();
    expect(app.state[first].loading).toBe(false);
    for (const other of others(first)) expect(app.state[other].loading).toBe(true);
    expect(finished).toBe(false);
    expect([...app.cache.keys()]).toEqual([KEY[first]]);
    for (const other of others(first)) app.answer(other);
    await job;
    expect(app.state.needs).toEqual({ needs: freshNeeds, loading: false });
    expect(app.state.topics).toEqual({ topics: freshTopics, loading: false });
    expect(app.pathUpdates).toEqual([{ ...freshPaths, loading: false, error: false }]);
    for (const one of RESOURCES) expect(app.cache.get(KEY[one])?.data).toEqual(fresh[one]);
  });

  test(`refresh: ${first} failure settles independently and preserves cached content`, async () => {
    const initial = cached();
    const app = refreshHost(initial);
    const job = app.refresh();
    app.fail(first);
    await settled();
    for (const one of RESOURCES) expect(app.state[one]).toBe(initial[one]);
    expect(app.cache.size).toBe(0); // Failed data never replaces the cache.
    for (const other of others(first)) app.answer(other, empty[other]);
    await job;
    expect(app.state[first]).toBe(initial[first]);
    for (const other of others(first)) expect(app.state[other].loading).toBe(false);
    expect(app.cache.size).toBe(2);
  });

  test(`refresh: uncached ${first} failure clears loading without waiting for the others`, async () => {
    const app = refreshHost();
    const job = app.refresh();
    app.fail(first);
    await settled();
    expect(app.state[first].loading).toBe(false);
    for (const other of others(first)) expect(app.state[other].loading).toBe(true);
    for (const other of others(first)) app.fail(other);
    await job;
    expect(app.state.paths).toEqual({ paths: [], days: [], loading: false, error: true });
    expect(app.state.needs).toEqual({ needs: [], loading: false });
    expect(app.state.topics).toEqual({ topics: [], loading: false });
    expect(app.cache.size).toBe(0);
  });
}

test("refresh: equal results keep state identity while renewing every cache", async () => {
  const initial = cached();
  const app = refreshHost(initial);
  const job = app.refresh();
  for (const one of RESOURCES) app.answer(one, structuredClone(fresh[one]));
  await job;
  for (const one of RESOURCES) expect(app.state[one]).toBe(initial[one]);
  expect(app.cache.size).toBe(3);
  for (const entry of app.cache.values()) expect(entry.at).toBeGreaterThan(0);
});

test("refresh: a successful retry clears the previous empty-path error", async () => {
  const app = refreshHost({
    needs: { needs: [], loading: false },
    topics: { topics: [], loading: false },
    paths: { paths: [], days: [], loading: false, error: true },
  });
  const job = app.refresh();
  app.answer("paths", empty.paths);
  await settled();
  expect(app.state.paths).toEqual({ paths: [], days: [], loading: false, error: false });
  app.answer("needs", []);
  app.answer("topics", []);
  await job;
});

test("refresh: local fixtures do not fetch remote data", async () => {
  const app = refreshHost(undefined, true);
  await app.refresh();
  expect(app.called).toEqual([]);
  expect(app.cache.size).toBe(0);
});
