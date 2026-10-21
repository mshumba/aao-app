// Node's built-ins, typed here: the app's tsconfig leaves Node's types out
// (a type reference here would let Node APIs into app code unnoticed).
import ts from "typescript";
import { expect, test } from "@playwright/test";
type Fs = { readFileSync(path: string, encoding: "utf8"): string };
type Vm = { runInNewContext(code: string, context: object): unknown };
const builtin = (id: string) =>
  (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule(id);
const { readFileSync } = builtin("node:fs") as Fs;
const { runInNewContext } = builtin("node:vm") as Vm;

/** Execute the real provider and hook once per mount, with state writes and
 * effect cleanup recorded. No React rendering or timer behavior is recreated.
 */
function toastMounts() {
  const filename = `${test.info().project.testDir}/../src/toast.tsx`;
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["ToastContext", "mountedToast", "dispatchToast", "ToastProvider", "useToast"]);
  const declarations = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node) ? names.has(node.name?.text ?? "") :
      ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(source))),
  );
  const code = ts.transpileModule(declarations.map((node) => node.getText(source)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  type Show = (message: string, icon?: string) => void;
  type Toast = { message: string; icon: string } | null;
  const exports: { ToastProvider?: (props: object) => unknown; useToast?: () => Show } = {};
  const context = { Provider: Symbol("ToastProvider") };
  let value: Show | null = null;
  let updates: Toast[] = [];
  let layouts: (() => () => void)[] = [];
  let effects: (() => () => void)[] = [];
  const timers = new Map<number, () => void>();
  const cleared: number[] = [];
  const announced: string[] = [];
  let nextTimer = 0;
  runInNewContext(code, {
    exports,
    createContext: () => context,
    useContext: () => value,
    useState: (initial: unknown) => { const target = updates; return [initial, (toast: Toast) => target.push(toast)]; },
    useRef: (current: unknown) => ({ current }),
    useCallback: (callback: unknown) => callback,
    useLayoutEffect: (effect: () => () => void) => layouts.push(effect),
    useEffect: (effect: () => () => void) => effects.push(effect),
    React: { createElement: (type: unknown, props: { value?: Show }) => { if (type === context.Provider) value = props.value!; } },
    ToastLayer: () => null,
    Platform: { OS: "ios" },
    AccessibilityInfo: { announceForAccessibility: (message: string) => announced.push(message) },
    setTimeout: (callback: () => void) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id: number) => { cleared.push(id); timers.delete(id); },
  });
  return {
    announced, cleared, timers,
    outside: () => { value = null; return exports.useToast!(); },
    mount() {
      updates = []; layouts = []; effects = [];
      const received = updates;
      exports.ToastProvider!({ children: null });
      const cleanup = [...layouts, ...effects].map((effect) => effect());
      return { received, show: exports.useToast!(), unmount: () => cleanup.forEach((dispose) => dispose()) };
    },
  };
}

test("a retained toast callback reaches the replacement provider and survives old cleanup", () => {
  const host = toastMounts();
  const first = host.mount();
  first.show("First");
  const second = host.mount();
  first.show("Signed in", "person");
  // A late cleanup from the old root must not detach the new provider.
  first.unmount();
  first.show("Saved", "bookmark");
  expect(first.received.map((toast) => toast?.message)).toEqual(["First"]);
  expect(second.received.map((toast) => [toast?.message, toast?.icon])).toEqual([["Signed in", "person"], ["Saved", "bookmark"]]);
  expect(host.announced).toEqual(["First", "Signed in", "Saved"]);
  expect(host.cleared).toEqual([1, 2]);
  expect([...host.timers.keys()]).toEqual([3]);
  host.timers.get(3)!();
  expect(second.received.at(-1)).toBeNull();
  second.unmount();
  first.show("No mounted provider");
  expect(host.announced).toEqual(["First", "Signed in", "Saved"]);
  expect(host.cleared).toEqual([1, 2, 3]);
  expect(host.timers.size).toBe(0);
});

test("useToast still requires a provider", () => {
  expect(() => toastMounts().outside()).toThrow("useToast must be used inside ToastProvider.");
});
