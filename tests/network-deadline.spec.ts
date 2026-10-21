import { expect, test } from "@playwright/test";
import ts from "typescript";
import { fetchWithTimeout, request } from "../src/learning/request";

// The request helper behind search, quotes, the learning tables and the
// blessing (src/learning/request.ts), against a stand-in server on this
// machine that sends its headers at once and then stalls mid-body, the way
// a dropped mobile connection looks. fetch resolves at the headers, so the
// deadline and the caller's cancellation have to last until the body has
// been read: otherwise a search stays loading for good, and cancelling it
// leaves the transfer running.

// Node's built-ins, typed here: the app's tsconfig leaves Node's types out.
type Reply = {
  writeHead(status: number, headers: Record<string, string>): void;
  write(chunk: string): void;
  end(chunk?: string): void;
  on(event: "close", listener: () => void): void;
};
type Server = {
  listen(port: number, host: string, ready: () => void): void;
  address(): { port: number };
  close(): void;
  closeAllConnections(): void;
};
type Http = { createServer(handle: (req: { url?: string }, res: Reply) => void): Server };
type Fs = { readFileSync(path: string, encoding: "utf8"): string };
const builtin = (id: string) =>
  (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule(id);
const http = builtin("node:http") as Http;
const fs = builtin("node:fs") as Fs;

/** Requests (by their ?id=) whose connection closed before the server ended them. */
const stopped = new Set<string>();
let server: Server;
let base = "";

test.beforeAll(async () => {
  // request.ts as the browser test loads it.
  const source = fs.readFileSync(`${test.info().project.testDir}/../src/learning/request.ts`, "utf8");
  const script = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stand-in");
    const id = url.searchParams.get("id") ?? "";
    let ended = false;
    res.on("close", () => {
      if (!ended) stopped.add(id);
    });
    const end = (chunk?: string) => {
      ended = true;
      res.end(chunk);
    };
    const json = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    switch (url.pathname) {
      case "/stall": // Headers, half a body, then nothing.
        res.writeHead(200, json);
        res.write('{"moments":');
        return;
      case "/stall-error": // The same for an error answer.
        res.writeHead(503, json);
        res.write('{"error":');
        return;
      case "/slow": // The whole body, in two parts 150 ms apart.
        res.writeHead(200, json);
        res.write('{"ok":');
        setTimeout(() => end("true}"), 150);
        return;
      case "/request.js":
        res.writeHead(200, { "Content-Type": "text/javascript" });
        return end(script);
      default:
        res.writeHead(200, { "Content-Type": "text/html" });
        return end("<!doctype html><title>Stand-in</title>");
    }
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => {
  server.closeAllConnections();
  server.close();
});

// The signal each fetch was given, so a test can see the transfer was told to stop.
const realFetch = globalThis.fetch;
let signals: AbortSignal[] = [];
test.beforeEach(() => {
  signals = [];
  globalThis.fetch = (input, init) => {
    if (init?.signal) signals.push(init.signal);
    return realFetch(input, init);
  };
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/** How a request ended: its value or error name, and when. */
async function outcome<T>(run: () => Promise<T>) {
  const started = Date.now();
  try {
    return { value: await run(), error: null, ms: Date.now() - started };
  } catch (error) {
    return { value: null, error: (error as Error).name, ms: Date.now() - started };
  }
}

test("a body that stalls after the headers times out, and its transfer stops", async () => {
  let headers = 0;
  const result = await outcome(() =>
    request(`${base}/stall?id=timeout`, { timeoutMs: 200 }, (response) => {
      headers = response.status;
      return response.json();
    }),
  );
  expect(headers).toBe(200);
  expect(result.error).toBe("TimeoutError");
  expect(result.ms).toBeLessThan(2_000);
  expect(signals[0].aborted).toBe(true);
  await expect.poll(() => stopped.has("timeout")).toBe(true);
});

test("cancelling after the headers stops the request at once, and its transfer", async () => {
  const caller = new AbortController();
  const result = await outcome(() =>
    request(`${base}/stall?id=cancel`, { timeoutMs: 10_000, signal: caller.signal }, (response) => {
      setTimeout(() => caller.abort(), 50);
      return response.json();
    }),
  );
  // Well before the 10 s deadline: the cancel stopped it, not the timer.
  expect(result.error).toBe("AbortError");
  expect(result.ms).toBeLessThan(2_000);
  expect(signals[0].aborted).toBe(true);
  await expect.poll(() => stopped.has("cancel")).toBe(true);

  // Cancelled before it starts: nothing is sent.
  const early = await outcome(() =>
    request(`${base}/stall?id=early`, { signal: AbortSignal.abort() }, (response) => response.json()),
  );
  expect(early.error).toBe("AbortError");
});

test("an error answer whose body stalls times out too", async () => {
  // As search reads one: the body's reason if it has one, else the status.
  const result = await outcome(() =>
    request(`${base}/stall-error?id=error`, { timeoutMs: 200 }, async (response) => {
      if (response.ok) return response.json();
      const body = await response.json().catch(() => ({}));
      throw new Error(`unavailable (${response.status}) ${JSON.stringify(body)}`);
    }),
  );
  expect(result.error).toBe("TimeoutError");
  expect(result.ms).toBeLessThan(2_000);
  await expect.poll(() => stopped.has("error")).toBe(true);
});

test("a whole answer is read, and the deadline and the caller's signal end with it", async () => {
  const caller = new AbortController();
  const result = await outcome(() =>
    request(`${base}/slow?id=whole`, { timeoutMs: 400, signal: caller.signal }, (response) => response.json()),
  );
  expect(result.value).toEqual({ ok: true });
  // Past the deadline, and the caller cancels late: the finished request is left alone.
  await new Promise((resolve) => setTimeout(resolve, 500));
  caller.abort();
  expect(signals[0].aborted).toBe(false);
  expect(stopped.has("whole")).toBe(false);
});

test("the deadline holds even where aborting can't reach the body", async () => {
  // A fetch whose body ignores its signal (unlike a browser's).
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"moments":'));
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  const timed = await outcome(() => request("https://stand-in.invalid/", { timeoutMs: 50 }, (r) => r.json()));
  expect(timed.error).toBe("TimeoutError");
  expect(timed.ms).toBeLessThan(1_000);

  const caller = new AbortController();
  const cancelled = outcome(() =>
    request("https://stand-in.invalid/", { timeoutMs: 10_000, signal: caller.signal }, (r) => r.json()),
  );
  setTimeout(() => caller.abort(), 20);
  expect((await cancelled).error).toBe("AbortError");
  expect((await cancelled).ms).toBeLessThan(1_000);
});

test("fetchWithTimeout hands back a body that has already arrived", async () => {
  // The blessing reads its own Response; it gets one whose body is all here.
  const response = await fetchWithTimeout(`${base}/slow?id=wrapped`, { timeoutMs: 400 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(await response.json()).toEqual({ ok: true });
  expect(signals[0].aborted).toBe(false);

  const stalled = await outcome(() => fetchWithTimeout(`${base}/stall?id=wrapped-stall`, { timeoutMs: 200 }));
  expect(stalled.error).toBe("TimeoutError");
  await expect.poll(() => stopped.has("wrapped-stall")).toBe(true);
});

test("in a browser, a stalled body times out and cancelling after the headers stops it", async ({ page }) => {
  // The web app's case: a browser's fetch streams the body after the headers.
  await page.goto(`${base}/`);
  const results = await page.evaluate(async () => {
    const path = "/request.js";
    const { request: timed } = (await import(path)) as typeof import("../src/learning/request");
    const run = async (go: () => Promise<unknown>) => {
      const started = performance.now();
      try {
        await go();
        return { error: null, ms: performance.now() - started };
      } catch (error) {
        return { error: (error as Error).name, ms: performance.now() - started };
      }
    };
    const timeout = await run(() => timed("/stall?id=web-timeout", { timeoutMs: 300 }, (r) => r.json()));
    const caller = new AbortController();
    const cancel = await run(() =>
      timed("/stall?id=web-cancel", { timeoutMs: 10_000, signal: caller.signal }, (r) => {
        setTimeout(() => caller.abort(), 50);
        return r.json();
      }),
    );
    const whole = await run(() => timed("/slow?id=web-whole", { timeoutMs: 2_000 }, (r) => r.json()));
    return { timeout, cancel, whole };
  });
  expect(results.timeout.error).toBe("TimeoutError");
  expect(results.timeout.ms).toBeLessThan(2_000);
  expect(results.cancel.error).toBe("AbortError");
  expect(results.cancel.ms).toBeLessThan(2_000);
  expect(results.whole.error).toBeNull();
  await expect.poll(() => stopped.has("web-timeout") && stopped.has("web-cancel")).toBe(true);
});
