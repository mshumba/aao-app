// deno test --allow-env --allow-read _shared/limits_test.ts
// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { careLimits, LIMIT_DEFAULTS, quotesLimits, scopeOf, searchLimits } from "./limits.ts";

const guest = { key: "search:ip:abc", signedIn: false };
const member = { key: "search:u:123", signedIn: true };

Deno.test("search: the caller's own allowance, then everyone's, with the documented defaults", () => {
  assertEquals(searchLimits(guest), [
    { key: "search:ip:abc", max: LIMIT_DEFAULTS.SEARCH_GUEST_PER_5MIN, windowSeconds: 300 },
    { key: "search:all", max: LIMIT_DEFAULTS.SEARCH_GLOBAL_PER_HOUR, windowSeconds: 3600 },
  ]);
  assertEquals(searchLimits(member)[0], { key: "search:u:123", max: 30, windowSeconds: 300 });
  assertEquals(careLimits(), [{ key: "search:care", max: 300, windowSeconds: 3600 }]);
  assertEquals(quotesLimits({ key: "quotes:u:1", signedIn: true }).map((l) => l.max), [30, 600]);
});

Deno.test("limits: a secret overrides a default; a bad value doesn't", () => {
  Deno.env.set("SEARCH_GLOBAL_PER_HOUR", "5000");
  Deno.env.set("SEARCH_GUEST_PER_5MIN", "nonsense");
  try {
    assertEquals(searchLimits(guest).map((l) => l.max), [120, 5000]);
  } finally {
    Deno.env.delete("SEARCH_GLOBAL_PER_HOUR");
    Deno.env.delete("SEARCH_GUEST_PER_5MIN");
  }
});

Deno.test("scopeOf: the last limit is everyone's", () => {
  const limits = searchLimits(guest);
  assertEquals(scopeOf(limits, 1), "caller");
  assertEquals(scopeOf(limits, 2), "everyone");
  assertEquals(scopeOf(careLimits(), 1), "caller");
});
