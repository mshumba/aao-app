// deno test --allow-env --allow-read _shared/db_test.ts
// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { transient, withRetry } from "./db.ts";

const err = (code: string, status: number) => ({ error: { code, message: "x" }, status });

Deno.test("transient: connection failures, restarts and timeouts", () => {
  assertEquals(transient(err("", 0)), true); // fetch failed or our abort
  assertEquals(transient(err("", 503)), true);
  assertEquals(transient(err("PGRST001", 503)), true);
  assertEquals(transient(err("PGRST002", 503)), true);
  assertEquals(transient(err("57P03", 500)), true); // the database is starting up
  assertEquals(transient(err("08006", 500)), true);
  assertEquals(transient(err("57014", 500)), true); // statement timeout
});

Deno.test("transient: not a bad request or a success", () => {
  assertEquals(transient({ error: null, status: 200 }), false);
  assertEquals(transient(err("42883", 404)), false); // no such function
  assertEquals(transient(err("23514", 400)), false); // check constraint
  assertEquals(transient(err("PGRST202", 404)), false);
});

Deno.test("withRetry: once more after a transient error, never after others", async () => {
  let calls = 0;
  const flaky = await withRetry(() =>
    Promise.resolve(++calls === 1 ? err("PGRST001", 503) : { error: null, status: 200 })
  );
  assertEquals([calls, flaky.status], [2, 200]);

  calls = 0;
  const down = await withRetry(() => Promise.resolve((calls++, err("", 0))));
  assertEquals([calls, down.status], [2, 0]); // gives up after one retry

  calls = 0;
  let noted = 0;
  const bad = await withRetry(() => Promise.resolve((calls++, err("23514", 400))), () => noted++);
  assertEquals([calls, noted, bad.status], [1, 0, 400]);
});
