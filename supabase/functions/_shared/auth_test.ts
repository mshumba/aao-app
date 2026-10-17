// deno test --allow-env --allow-read _shared/auth_test.ts
// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { clientIp } from "./auth.ts";

const headers = (h: Record<string, string>) => new Headers(h);

Deno.test("clientIp: the right-most x-forwarded-for entry, which the platform added", () => {
  // A client wrote its own header; the platform appended the real address.
  const spoofed = headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.7" });
  assertEquals(clientIp(spoofed, undefined), { ip: "198.51.100.7", from: "xff", hops: 2 });
  assertEquals(clientIp(headers({ "x-forwarded-for": "198.51.100.7" }), undefined).ip, "198.51.100.7");
});

Deno.test("clientIp: internal hops on the right are skipped", () => {
  const h = headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.7, 10.0.3.4, 100.64.0.2, 127.0.0.1" });
  assertEquals(clientIp(h, undefined), { ip: "198.51.100.7", from: "xff", hops: 5 });
  const v6 = headers({ "x-forwarded-for": "2001:db8::1, fd00::5, ::1" });
  assertEquals(clientIp(v6, undefined).ip, "2001:db8::1");
});

Deno.test("clientIp: cf-connecting-ip when set to, or when there is no usable x-forwarded-for", () => {
  const both = headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.7", "cf-connecting-ip": "198.51.100.8" });
  assertEquals(clientIp(both, "cf"), { ip: "198.51.100.8", from: "cf", hops: 2 });
  assertEquals(clientIp(both, undefined).ip, "198.51.100.7");
  assertEquals(clientIp(headers({ "cf-connecting-ip": "198.51.100.8" }), undefined).from, "cf");
  assertEquals(clientIp(headers({ "x-forwarded-for": "10.0.0.1" }), undefined).from, "none");
  assertEquals(clientIp(headers({ "x-real-ip": "198.51.100.9" }), undefined), {
    ip: "198.51.100.9",
    from: "real-ip",
    hops: 0,
  });
  assertEquals(clientIp(headers({}), undefined), { ip: "unknown", from: "none", hops: 0 });
});
