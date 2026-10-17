import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";

// js-yaml is already locked with the development lint toolchain. These tests
// need no install, credentials, browser, or GitHub/service calls.
const yaml = createRequire(resolve("package.json"))("js-yaml") as { load(source: string): unknown };
type Step = { name?: string; uses?: string; shell?: string; env?: Record<string, string>; run?: string; with?: Record<string, unknown> };
type Workflow = {
  on: { schedule: { cron: string }[]; workflow_dispatch: { inputs: Record<string, { type: string; required: boolean; default: boolean }> } };
  permissions: Record<string, string>;
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, { if: string; environment: string; "timeout-minutes": number; steps: Step[] }>;
};
const source = readFileSync(resolve(".github/workflows/nightly-sermons.yml"), "utf8");
const workflow = yaml.load(source) as Workflow;
const job = workflow.jobs.import;
const step = job.steps.find((item) => item.run?.includes("scripts/nightly-sermons.mts"))!;
const inputDefaults = Object.fromEntries(Object.entries(workflow.on.workflow_dispatch.inputs).map(([key, value]) => [key, value.default]));

type Context = { ref?: string; event?: string; enabled?: string; inputs?: Record<string, boolean> };
function expression(value: string, context: Context = {}) {
  // The actual workflow expressions use only Boolean/string comparisons,
  // &&/||, context properties and toJSON, which have matching JS semantics for
  // the lower-case Boolean inputs and exact ref values exercised here.
  expect(value.startsWith("${{")).toBe(true);
  expect(value.endsWith("}}")).toBe(true);
  return runInNewContext(value.slice(3, -2), {
    github: { ref: context.ref ?? "refs/heads/main", event_name: context.event ?? "workflow_dispatch" },
    vars: { NIGHTLY_SERMON_IMPORT_ENABLED: context.enabled ?? "" },
    inputs: context.inputs ?? inputDefaults,
    toJSON: JSON.stringify,
  }, { timeout: 100 });
}
function execute(dryRun: string, allowBacklog: string) {
  // Execute the real argument-building shell; the function captures argv and
  // prevents the real importer from running even if its flags are wrong.
  return spawnSync("/bin/bash", ["--noprofile", "--norc", "-c", `node() { printf '%s\\0' "$@"; }\n${step.run}`], {
    env: { NODE_ENV: "test", PATH: "/usr/bin:/bin", DRY_RUN: dryRun, ALLOW_BACKLOG: allowBacklog }, encoding: "utf8",
  });
}
function argsFor(context: Context) {
  const result = execute(expression(step.env!.DRY_RUN, context), expression(step.env!.ALLOW_BACKLOG, context));
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout.split("\0").filter(Boolean);
}
const command = ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/nightly-sermons.mts"];

test("only main dispatches or opted-in main schedules can reach the protected import job", () => {
  expect(Object.keys(workflow.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
  expect(Object.keys(workflow.jobs)).toEqual(["import"]);
  expect(job.environment).toBe("catalogue-import");
  for (const event of ["workflow_dispatch", "schedule", "push", "pull_request"]) {
    for (const enabled of ["", "false", "true"]) {
      for (const ref of ["refs/heads/main", "refs/heads/claude/frontend-ux-pass", "refs/heads/codex/test", "refs/tags/main", "refs/tags/v1"]) {
        const permitted = ref === "refs/heads/main" && (event === "workflow_dispatch" || (event === "schedule" && enabled === "true"));
        expect(expression(job.if, { ref, event, enabled }), `${event} ${ref} enabled=${enabled}`).toBe(permitted);
      }
    }
  }
});

test("manual defaults execute a dry run even while the schedule is disabled", () => {
  expect(workflow.on.workflow_dispatch.inputs).toMatchObject({
    dry_run: { type: "boolean", required: true, default: true },
    allow_backlog: { type: "boolean", required: true, default: false },
  });
  expect(expression(job.if, { enabled: "false" })).toBe(true);
  expect(argsFor({ enabled: "false" })).toEqual([...command, "--dry-run"]);
});

test("manual apply is explicit and schedule applies cannot opt into a backlog", () => {
  expect(argsFor({ inputs: { dry_run: false, allow_backlog: false } })).toEqual([...command, "--apply"]);
  expect(argsFor({ inputs: { dry_run: false, allow_backlog: true } })).toEqual([...command, "--apply", "--allow-backlog"]);
  expect(argsFor({ inputs: { dry_run: true, allow_backlog: true } })).toEqual([...command, "--dry-run", "--allow-backlog"]);
  expect(argsFor({ event: "schedule", enabled: "true", inputs: { dry_run: true, allow_backlog: true } })).toEqual([...command, "--apply"]);
});

test("invalid Boolean strings fail before Node runs without evaluating or logging their values", () => {
  expect(step.shell).toBe("bash");
  expect(step.run).not.toContain("${{"); // No direct interpolation into shell source.
  for (const invalid of ["", "null", "TRUE", "0", "false; printf injected", "$(printf injected)", "`printf injected`", "false\nprintf injected"]) {
    for (const [dryRun, allowBacklog, field] of [[invalid, "false", "dry_run"], ["true", invalid, "allow_backlog"]]) {
      const result = execute(dryRun, allowBacklog);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`Invalid ${field} input; expected true or false\n`);
    }
  }
});

test("secrets are confined to the import step and ordinary validation CI cannot request them", () => {
  expect(step.env).toMatchObject({
    YOUTUBE_API_KEY: "${{ secrets.YOUTUBE_API_KEY }}",
    SUPABASE_SECRET_KEY: "${{ secrets.SUPABASE_SECRET_KEY }}",
    YOUTUBE_CHANNEL_ID: "${{ vars.YOUTUBE_CHANNEL_ID }}",
    SUPABASE_URL: "${{ vars.SUPABASE_URL }}",
  });
  const withoutImport = { ...workflow, jobs: { import: { ...job, steps: job.steps.filter((item) => item !== step) } } };
  expect(JSON.stringify(withoutImport)).not.toMatch(/secrets\./);
  expect(step.run).not.toMatch(/SUPABASE_SECRET_KEY|YOUTUBE_API_KEY/);
  const ci = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
  expect(ci).not.toMatch(/catalogue-import|SUPABASE_SECRET_KEY|YOUTUBE_API_KEY|nightly-sermons\.mts/);
  expect(ci).toMatch(/run: npm test/); // Discovers this .spec.ts in the ordinary suite.
});

test("the job retains pinned tools, read-only permissions, bounded runtime and no dependency install", () => {
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.concurrency).toEqual({ group: "nightly-sermon-discovery", "cancel-in-progress": false });
  expect(workflow.on.schedule).toEqual([{ cron: "37 8 * * *" }]);
  expect(job["timeout-minutes"]).toBe(10);
  expect(job.steps.filter((item) => item.uses).map((item) => item.uses)).toEqual([
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  ]);
  expect(job.steps[0].with?.["persist-credentials"]).toBe(false);
  expect(job.steps[1].with?.["node-version-file"]).toBe(".nvmrc");
  expect(job.steps.filter((item) => item.run)).toEqual([step]);
  expect(step.run).not.toMatch(/npm|npx|yarn|pnpm|--no-warnings|--disable-warning=(?!MODULE_TYPELESS_PACKAGE_JSON)/);
});
