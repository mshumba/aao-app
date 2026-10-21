import { expect, test } from "@playwright/test";
import type { WatchProgress } from "../src/auth/types";
import {
  mountPlayer,
  playFourSeconds,
  type HarnessSermon as Sermon,
  type MountedPlayer as Player,
} from "./player-harness";

// A signed-in viewer presses Watch before their account's progress has
// loaded, so their saved place arrives late. The real PlayerProvider runs
// here without React Native or a browser (player-harness.ts), and a
// stand-in engine records the commands it sends to YouTube.

const SERMON: Sermon = { id: "test-sermon", source: "https://www.youtube.com/watch?v=test-sermon" };
const SAVED: WatchProgress = {
  sermonId: SERMON.id,
  positionSeconds: 250,
  durationSeconds: 600,
  finished: false,
  updatedAt: "2026-10-16T10:00:00.000Z",
};

/** Watch, the player becomes ready, and the sermon plays four seconds in. */
const watchFourSeconds = (player: Player, from?: number) => playFourSeconds(player, SERMON, from);

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

// This device's copy of the place, from an earlier launch, shown until the
// account's progress has been read from the server: another device may have
// saved a newer place since (SAVED).
const COPY: WatchProgress = { ...SAVED, positionSeconds: 100, updatedAt: "2026-10-15T10:00:00.000Z" };

/** Watch with no place asked for, the player becomes ready, and the sermon plays `played` seconds. */
function watchFromCopy(player: Player, played: number) {
  player.session.load(SERMON);
  player.flush();
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  player.session.onEvent({ type: "state", state: 1, seconds: COPY.positionSeconds + played, duration: 600 });
  player.flush();
}

test("the device's copy of the place starts the sermon, and a newer place from the server replaces it", async () => {
  const player = mountPlayer([COPY]);
  player.session.load(SERMON);
  player.flush();
  // Offline, this is where it stays.
  expect(player.playback.seconds).toBe(100);
  expect(player.session.resumedFrom).toBe(100);
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  player.session.onEvent({ type: "state", state: 1, seconds: 104, duration: 600 });
  player.flush();
  expect(player.commands).toEqual(["play"]);
  await player.answer([SAVED]);
  expect(player.commands).toEqual(["play", "seek:250"]);
  expect(player.playback.seconds).toBe(250);
  expect(player.session.resumedFrom).toBe(250);
});

test("the server's place leaves a viewer who has watched on from the device's copy where they are", async () => {
  const player = mountPlayer([COPY]);
  watchFromCopy(player, 20);
  await player.answer([SAVED]);
  expect(player.commands).toEqual(["play"]);
  expect(player.playback.seconds).toBe(120);
});

test("the same place on the server changes nothing, and a sermon finished elsewhere starts over", async () => {
  const same = mountPlayer([COPY]);
  watchFromCopy(same, 4);
  await same.answer([{ ...COPY, updatedAt: "2026-10-16T09:00:00.000Z" }]);
  expect(same.commands).toEqual(["play"]);
  expect(same.playback.seconds).toBe(104);

  const finished = mountPlayer([COPY]);
  watchFromCopy(finished, 4);
  await finished.answer([{ ...SAVED, positionSeconds: 600, finished: true }]);
  expect(finished.commands).toEqual(["play", "seek:0"]);
  expect(finished.playback.seconds).toBe(0);
  expect(finished.session.resumedFrom).toBe(0);
});

// A time the player polled before a seek reached it arrives just after the
// seek: it mustn't put the viewer back, or the next ±15 counts from there.
function stale(player: Player, seconds: number) {
  player.session.onEvent({ type: "state", state: 1, seconds, duration: 600 });
  player.flush();
}

test("after Start over, a stale time doesn't move the viewer back, so +15 counts from the start", () => {
  const player = mountPlayer();
  watchFourSeconds(player, 300);
  player.session.startOver();
  player.flush();
  stale(player, 305);
  expect(player.playback.seconds).toBe(0);
  player.playback.skip(15);
  player.flush();
  expect(player.commands).toEqual(["play", "seek:0", "seek:15"]);
});

test("after the server's newer place moves the viewer, a stale time doesn't move them back", async () => {
  const player = mountPlayer([COPY]);
  watchFromCopy(player, 4);
  await player.answer([SAVED]);
  stale(player, 105);
  expect(player.playback.seconds).toBe(250);
  player.playback.skip(15);
  player.flush();
  expect(player.commands).toEqual(["play", "seek:250", "seek:265"]);
});

test("a saved place moved to once the player is ready isn't undone by a stale time", async () => {
  const player = mountPlayer();
  player.session.load(SERMON);
  player.flush();
  await player.answer([SAVED]);
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  stale(player, 0);
  expect(player.playback.seconds).toBe(250);
  player.playback.skip(15);
  player.flush();
  expect(player.commands).toEqual(["seek:250", "play", "seek:265"]);
});

// YouTube can load and never start: its own gate in the player ("Sign in to
// confirm you're not a bot"), or a start the browser refused. It then reports
// 0:00, which isn't the viewer's place.
function state(player: Player, state: number, seconds: number) {
  player.session.onEvent({ type: "state", state, seconds, duration: 600 });
  player.flush();
}

test("a player that never starts keeps the viewer's place and saves nothing over it", () => {
  const player = mountPlayer([COPY]);
  player.session.load(SERMON);
  player.flush();
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  state(player, -1, 0);
  expect(player.playback.seconds).toBe(100);
  // Leaving the app pauses it, and the pause reports 0:00 too.
  player.playback.pause();
  state(player, 2, 0);
  expect(player.playback.seconds).toBe(100);
  player.session.close();
  player.flush();
  expect(player.saves).toEqual([]);
  // Started again at its place, +15 counts from there.
  watchFromCopy(player, 0);
  player.playback.skip(15);
  player.flush();
  expect(player.commands).toEqual(["play", "pause", "play", "seek:115"]);
});

test("once it plays, the player's time is the viewer's place and is saved", () => {
  const player = mountPlayer([COPY]);
  player.session.load(SERMON);
  player.flush();
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  state(player, -1, 0);
  state(player, 1, 100);
  state(player, 2, 130);
  expect(player.playback.seconds).toBe(130);
  expect(player.saves).toEqual([130]);
});

test("a saved place moved to while it can't start stays, however long the player sits at 0:00", async () => {
  const player = mountPlayer();
  player.session.load(SERMON);
  player.flush();
  await player.answer([SAVED]);
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  expect(player.commands).toEqual(["seek:250", "play"]);
  // Long after the seek would have settled had it played.
  const now = Date.now;
  Date.now = () => now() + 10_000;
  try {
    state(player, -1, 0);
    expect(player.playback.seconds).toBe(250);
    state(player, 1, 250);
    player.playback.skip(15);
    player.flush();
  } finally {
    Date.now = now;
  }
  expect(player.commands).toEqual(["seek:250", "play", "seek:265"]);
});
