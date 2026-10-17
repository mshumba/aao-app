// deno test _shared/openai_test.ts
// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";
import { hedged, OpenAIError, transientOpenAI } from "./openai.ts";

const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const failAfter = (ms: number, error: Error) => new Promise<never>((_, reject) => setTimeout(() => reject(error), ms));

Deno.test("hedged: a fast answer sends one request", async () => {
  let calls = 0;
  assertEquals(await hedged(() => (calls++, after(10, "a")), 50, transientOpenAI), "a");
  await after(80, null);
  assertEquals(calls, 1);
});

Deno.test("hedged: a slow first request is overtaken by the second", async () => {
  let calls = 0;
  const t0 = performance.now();
  const value = await hedged(() => (++calls === 1 ? after(300, "slow") : after(10, "fast")), 50, transientOpenAI);
  assertEquals([value, calls], ["fast", 2]);
  assertEquals(performance.now() - t0 < 200, true);
  await after(300, null); // let the slow one finish
});

Deno.test("hedged: a transient failure retries at once; a refusal does not", async () => {
  let calls = 0;
  const value = await hedged(
    () => (++calls === 1 ? failAfter(5, new OpenAIError("timeout", 0)) : after(5, "ok")),
    1000,
    transientOpenAI,
  );
  assertEquals([value, calls], ["ok", 2]);

  calls = 0;
  await assertRejects(
    () =>
      hedged(() => (calls++, failAfter(5, new OpenAIError("http 429 insufficient_quota", 429))), 1000, transientOpenAI),
    OpenAIError,
  );
  assertEquals(calls, 1);
});

Deno.test("hedged: fails when both tries fail", async () => {
  let calls = 0;
  await assertRejects(
    () => hedged(() => (calls++, failAfter(5, new OpenAIError("http 503", 503))), 1000, transientOpenAI),
    OpenAIError,
  );
  assertEquals(calls, 2);
});
