import { expect, test } from "@playwright/test";
import ts from "typescript";
import { createFailureReports, failureTags, scrubEvent, type FailureTags } from "../src/lib/failureReports";
import * as learningTypes from "../src/learning/types";

// Handled failures sent to Sentry (src/lib/failureReports.ts, sent by
// src/lib/monitoring.ts): what a report may carry, and how few an outage
// sends from each phone.

const MINUTE = 60_000;

// Node's built-ins, typed here: the app's tsconfig leaves Node's types out.
type Fs = { readFileSync(path: string, encoding: "utf8"): string };
type Vm = {
  compileFunction(code: string, params: string[], options: { filename: string }): (...args: unknown[]) => void;
};
const builtin = (id: string) =>
  (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule(id);

type Reported = { failure: string; details: Record<string, unknown> };

/**
 * src/learning/client.ts in Node, with the search and quotes functions
 * answering `answer` and what it reports collected instead of sent to
 * Sentry (src/lib/monitoring.ts needs a device).
 */
function learningClient(answer: () => Response) {
  const fs = builtin("node:fs") as Fs;
  const vm = builtin("node:vm") as Vm;
  const reported: Reported[] = [];
  const imports: Record<string, unknown> = {
    "../lib/monitoring": {
      reportFailure: (failure: string, details: Record<string, unknown>) => reported.push({ failure, details }),
    },
    "./fixtures": {},
    "./request": {
      request: (_url: string, _init: unknown, read: (response: Response) => Promise<unknown>) => read(answer()),
    },
    "./session": { authHeaders: async () => ({}), functionsBase: "https://aao.invalid/functions/v1", learningMode: "remote" },
    "./types": learningTypes,
  };
  const filename = `${test.info().project.testDir}/../src/learning/client.ts`;
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  vm.compileFunction(code, ["module", "exports", "require"], { filename })(mod, mod.exports, (name: string) => {
    // A new import in client.ts needs a stand-in here.
    if (!(name in imports)) throw new Error(`failure-reports.spec: no stand-in for "${name}"`);
    return imports[name];
  });
  return {
    search: mod.exports.search as (q: string) => Promise<unknown>,
    quotes: mod.exports.quotes as (ids: string[]) => Promise<unknown>,
    reported,
  };
}

const refused = (scope: string) => () =>
  new Response(JSON.stringify({ error: "rate_limited", retryAfter: 60, scope }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });

function reporter(limits: Parameters<typeof createFailureReports>[1] = {}) {
  let now = 0;
  const sent: FailureTags[] = [];
  const report = createFailureReports((tags) => void sent.push(tags), { now: () => now, ...limits });
  return {
    report,
    sent,
    wait: (ms: number) => {
      now += ms;
    },
  };
}

test("an outage sends a handful from each phone, not one for every failed request", () => {
  const { report, sent, wait } = reporter();
  // Search down for an hour: a search every 20 seconds fails.
  for (let i = 0; i < 180; i++) {
    report("search_unavailable", { step: "search", status: 503, code: "unavailable" });
    wait(20_000);
  }
  // Two an hour of each kind.
  expect(sent.filter((tags) => tags.failure === "search_unavailable")).toHaveLength(2);
  // Another kind still gets through…
  expect(report("catalogue_sync", { status: 500, code: "http" })).toBe(true);
  // …and the next hour sends again.
  wait(60 * MINUTE);
  expect(report("search_unavailable", { step: "search", status: 503 })).toBe(true);
});

test("a session sends at most ten reports, whatever fails", () => {
  const { report, sent, wait } = reporter();
  for (let hour = 0; hour < 24; hour++) {
    for (const failure of ["search_unavailable", "search_over_quota", "catalogue_sync", "sign_in", "progress_save"] as const)
      report(failure, {});
    wait(60 * MINUTE);
  }
  expect(sent).toHaveLength(10);
});

test("a report carries the failure's tag and identifiers only", () => {
  expect(failureTags("sign_in", { step: "verify", code: "rate_limited", status: 429 })).toEqual({
    failure: "sign_in",
    "failure.step": "verify",
    "failure.code": "rate_limited",
    "failure.status": "429",
  });
  expect(failureTags("progress_save", { step: "send", status: 403 })).toEqual({
    failure: "progress_save",
    "failure.step": "send",
    "failure.status": "403",
  });
});

test("nothing a person typed, or who they are, can ride along", () => {
  // An address, a search, a name or a server's message in place of a code
  // is dropped, as is a status that isn't one.
  const tags = failureTags("search_unavailable", {
    code: "Email address \"mufaro@example.com\" is invalid",
    step: "I'm tired of living",
    status: 0,
  });
  expect(tags).toEqual({ failure: "search_unavailable" });
  expect(failureTags("sign_in", { code: "mufaro@example.com" })).toEqual({ failure: "sign_in" });
  expect(failureTags("sign_in", { code: "Mufaro Shumba" })).toEqual({ failure: "sign_in" });
  // A kind the app doesn't know isn't sent at all.
  const { report, sent } = reporter();
  expect(report("mufaro@example.com" as never)).toBe(false);
  expect(sent).toEqual([]);
});

test("a report leaves without breadcrumbs, page address, extra data or user", () => {
  const event = scrubEvent({
    message: "Handled failure: search_unavailable",
    tags: { failure: "search_unavailable" },
    user: { email: "mufaro@example.com" },
    request: { url: "https://aao-app.expo.app/search?q=tired+of+living" },
    breadcrumbs: [{ category: "navigation", data: { to: "/search?q=tired+of+living" } }],
    extra: { query: "tired of living" },
    contexts: { os: { name: "iOS" } },
  });
  expect(event).toEqual({
    message: "Handled failure: search_unavailable",
    tags: { failure: "search_unavailable" },
    contexts: { os: { name: "iOS" } },
  });
  // A crash keeps its breadcrumbs (to show what led to it), never the user.
  const crash = scrubEvent({ user: { id: "x" }, breadcrumbs: [{ category: "ui.click" }] });
  expect(crash).toEqual({ breadcrumbs: [{ category: "ui.click" }] });
});

test("a search or quotes refused for its limit says whose limit ran out", async () => {
  // Everyone's allowance used up: an outage, which the alert is for.
  const busy = learningClient(refused("everyone"));
  const failure = await busy.search("tired").catch((error) => error);
  expect(failure).toMatchObject({ code: "rate_limited", scope: "everyone", retryAfter: 60 });
  expect(busy.reported).toEqual([
    {
      failure: "search_over_quota",
      details: { step: "search", status: 429, code: "rate_limited_everyone" },
    },
  ]);

  // One caller's own (a church's guest Wi-Fi on quotes): a code of its own,
  // which the alert leaves out (docs/development/failure-alerts.md).
  const church = learningClient(refused("caller"));
  await expect(church.quotes(["moment-1"])).rejects.toMatchObject({ code: "rate_limited", scope: "caller" });
  expect(church.reported).toEqual([
    {
      failure: "search_over_quota",
      details: { step: "quotes", status: 429, code: "rate_limited_caller" },
    },
  ]);
  expect(failureTags("search_over_quota", church.reported[0].details)["failure.code"]).toBe("rate_limited_caller");
});

test("a reporter that fails never breaks what it reports on", () => {
  const report = createFailureReports(() => {
    throw new Error("Sentry isn't there");
  });
  expect(() => report("progress_save", { step: "send", status: 500 })).not.toThrow();
});
