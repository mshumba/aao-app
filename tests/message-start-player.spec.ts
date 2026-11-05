import { expect, test } from "@playwright/test";
import type { WatchProgress } from "../src/auth/types";
import { MESSAGE_LEFT, MESSAGE_MIN, messageStart } from "../src/player/progress";
import { mountPlayer, type HarnessSermon, type MountedPlayer } from "./player-harness";

// Every sermon starts where the Apostle starts preaching (its card's
// preaching start, or a path day's teaching start), unless the viewer has a
// place in it or asked for one. The real PlayerProvider runs here without
// React Native or a browser (player-harness.ts), with the app's own (R2)
// player or the YouTube embed; a stand-in engine records the commands sent.

const SERMON: HarnessSermon = { id: "test-sermon", source: "https://www.youtube.com/watch?v=test-sermon" };
const LENGTH = 8915;
const MESSAGE = 1340; // 22:20
const SAVED: WatchProgress = {
  sermonId: SERMON.id,
  positionSeconds: 250,
  durationSeconds: LENGTH,
  finished: false,
  updatedAt: "2026-11-05T10:00:00.000Z",
};

/** The player becomes ready, then plays from `at` and reports `played` seconds in. */
function ready(player: MountedPlayer, at: number, played = 4, duration = LENGTH) {
  player.session.onEvent({ type: "ready", duration });
  player.flush();
  player.session.onEvent({ type: "state", state: 1, seconds: at + played, duration });
  player.flush();
}

test.describe("where the preaching starts, as the player trusts it", () => {
  test("a start in the first minute, or leaving under 10 minutes, plays from the beginning", () => {
    expect(MESSAGE_MIN).toBe(60);
    expect(MESSAGE_LEFT).toBe(600);
    expect(messageStart(MESSAGE, LENGTH)).toBe(MESSAGE);
    expect(messageStart(1340.8, LENGTH)).toBe(1340);
    expect(messageStart(60, LENGTH)).toBe(60);
    expect(messageStart(59, LENGTH)).toBeNull();
    expect(messageStart(0, LENGTH)).toBeNull();
    expect(messageStart(LENGTH - 600, LENGTH)).toBe(LENGTH - 600);
    expect(messageStart(LENGTH - 599, LENGTH)).toBeNull();
  });

  test("never past the end, nor without a length or a start", () => {
    expect(messageStart(LENGTH + 10, LENGTH)).toBeNull();
    expect(messageStart(MESSAGE, 0)).toBeNull();
    expect(messageStart(null, LENGTH)).toBeNull();
    expect(messageStart(undefined, LENGTH)).toBeNull();
    expect(messageStart(Number.NaN, LENGTH)).toBeNull();
    expect(messageStart(Number.POSITIVE_INFINITY, LENGTH)).toBeNull();
  });
});

for (const engine of ["native", "youtube"] as const) {
  test.describe(`with ${engine === "native" ? "the app's own (R2) player" : "the YouTube embed"}`, () => {
    const mount = (copy: WatchProgress[] = []) => mountPlayer(copy, { hls: engine === "native" });

    test("with no place of the viewer's, it starts where the preaching starts", async () => {
      const player = mount();
      player.session.load(SERMON, undefined, MESSAGE);
      player.flush();
      expect(player.session.engine).toBe(engine);
      expect(player.session.start).toBe(MESSAGE);
      ready(player, MESSAGE);
      expect(player.session.messageFrom).toBe(MESSAGE);
      expect(player.session.resumedFrom).toBe(0);
      // No place on the server either: it stays.
      await player.answer([]);
      expect(player.commands).toEqual(["play"]);
      expect(player.playback.seconds).toBe(MESSAGE + 4);
    });

    test("a saved place wins, and so does a place asked for", () => {
      const player = mount([SAVED]);
      player.session.load(SERMON, undefined, MESSAGE);
      player.flush();
      expect(player.session.start).toBe(250);
      expect(player.session.resumedFrom).toBe(250);
      expect(player.session.messageFrom).toBe(0);
      player.session.close();
      player.flush();
      // A moment, or a shared time.
      player.session.load(SERMON, 4120, MESSAGE);
      player.flush();
      expect(player.session.start).toBe(4120);
      expect(player.session.messageFrom).toBe(0);
    });

    test("a saved place that arrives late moves the viewer from the preaching to it", async () => {
      const player = mount();
      player.session.load(SERMON, undefined, MESSAGE);
      player.flush();
      ready(player, MESSAGE);
      await player.answer([SAVED]);
      expect(player.commands).toEqual(["play", "seek:250"]);
      expect(player.session.resumedFrom).toBe(250);
      expect(player.session.messageFrom).toBe(0);
    });

    test("Play from the start goes back to 0:00, and the place counts from there", () => {
      const player = mount();
      player.session.load(SERMON, undefined, MESSAGE);
      player.flush();
      ready(player, MESSAGE);
      player.session.startOver();
      player.flush();
      expect(player.commands).toEqual(["play", "seek:0"]);
      expect(player.session.messageFrom).toBe(0);
      expect(player.playback.seconds).toBe(0);
      // 20 seconds of worship is a place of the viewer's: pausing saves it.
      player.session.onEvent({ type: "state", state: 1, seconds: 1, duration: LENGTH });
      player.flush();
      player.session.onEvent({ type: "state", state: 1, seconds: 20, duration: LENGTH });
      player.flush();
      player.session.onEvent({ type: "state", state: 2, seconds: 20, duration: LENGTH });
      player.flush();
      expect(player.saves).toEqual([20]);
    });

    test("a few seconds at the preaching leave no place, so next time starts there again", () => {
      const player = mount();
      player.session.load(SERMON, undefined, MESSAGE);
      player.flush();
      ready(player, MESSAGE);
      player.session.onEvent({ type: "state", state: 2, seconds: MESSAGE + 4, duration: LENGTH });
      player.flush();
      expect(player.saves).toEqual([]);
    });

    test("the note goes once the viewer is well past where the preaching starts", () => {
      const player = mount();
      player.session.load(SERMON, undefined, MESSAGE);
      player.flush();
      ready(player, MESSAGE, 119);
      expect(player.session.messageFrom).toBe(MESSAGE);
      player.session.onEvent({ type: "state", state: 1, seconds: MESSAGE + 121, duration: LENGTH });
      player.flush();
      expect(player.session.messageFrom).toBe(0);
    });

    test("a video too short for where the preaching starts plays from the beginning", () => {
      const player = mount();
      player.session.load(SERMON, undefined, MESSAGE);
      player.flush();
      // The video the player has is 30 minutes, not the listed 2 hr 28 min.
      player.session.onEvent({ type: "ready", duration: 1800 });
      player.flush();
      expect(player.commands).toEqual(["seek:0", "play"]);
      expect(player.session.messageFrom).toBe(0);
      expect(player.playback.seconds).toBe(0);
    });
  });
}

test.describe("where the preaching starts, known only after Watch (the card arrives late)", () => {
  test("moves there once ready, when it arrives while the player loads", () => {
    const player = mountPlayer([], { hls: true });
    player.session.load(SERMON);
    player.flush();
    expect(player.session.start).toBe(0);
    player.session.offerOpening(SERMON.id, MESSAGE);
    player.flush();
    expect(player.commands).toEqual([]);
    expect(player.session.messageFrom).toBe(MESSAGE);
    ready(player, MESSAGE);
    expect(player.commands).toEqual(["seek:1340", "play"]);
  });

  test("moves there when it arrives just after it started playing", () => {
    const player = mountPlayer();
    player.session.load(SERMON);
    player.flush();
    ready(player, 0);
    player.session.offerOpening(SERMON.id, MESSAGE);
    player.flush();
    expect(player.commands).toEqual(["play", "seek:1340"]);
    expect(player.playback.seconds).toBe(MESSAGE);
    expect(player.session.messageFrom).toBe(MESSAGE);
  });

  test("leaves a viewer who has watched on, or chose a place, where they are", () => {
    const watched = mountPlayer();
    watched.session.load(SERMON);
    watched.flush();
    ready(watched, 0, 20);
    watched.session.offerOpening(SERMON.id, MESSAGE);
    watched.flush();
    expect(watched.commands).toEqual(["play"]);
    expect(watched.session.messageFrom).toBe(0);

    const chose = mountPlayer();
    chose.session.load(SERMON);
    chose.flush();
    ready(chose, 0);
    chose.playback.seek(90);
    chose.flush();
    chose.session.offerOpening(SERMON.id, MESSAGE);
    chose.flush();
    expect(chose.commands).toEqual(["play", "seek:90"]);
  });

  test("changes nothing for a saved place, a place asked for, or another sermon", () => {
    const saved = mountPlayer([SAVED]);
    saved.session.load(SERMON);
    saved.flush();
    ready(saved, 250);
    saved.session.offerOpening(SERMON.id, MESSAGE);
    saved.flush();
    expect(saved.commands).toEqual(["play"]);
    expect(saved.session.resumedFrom).toBe(250);

    const asked = mountPlayer();
    asked.session.load(SERMON, 4120);
    asked.flush();
    ready(asked, 4120);
    asked.session.offerOpening(SERMON.id, MESSAGE);
    asked.flush();
    expect(asked.commands).toEqual(["play"]);

    const other = mountPlayer();
    other.session.load(SERMON);
    other.flush();
    ready(other, 0);
    other.session.offerOpening("another-sermon", MESSAGE);
    other.flush();
    expect(other.commands).toEqual(["play"]);
  });

  test("a saved place arriving after it still wins; with none, it stays at the preaching", async () => {
    const resumes = mountPlayer();
    resumes.session.load(SERMON);
    resumes.flush();
    resumes.session.offerOpening(SERMON.id, MESSAGE);
    resumes.flush();
    ready(resumes, MESSAGE);
    await resumes.answer([SAVED]);
    expect(resumes.commands).toEqual(["seek:1340", "play", "seek:250"]);
    expect(resumes.session.resumedFrom).toBe(250);
    expect(resumes.session.messageFrom).toBe(0);

    const stays = mountPlayer();
    stays.session.load(SERMON);
    stays.flush();
    stays.session.offerOpening(SERMON.id, MESSAGE);
    stays.flush();
    ready(stays, MESSAGE);
    await stays.answer([]);
    expect(stays.commands).toEqual(["seek:1340", "play"]);
    expect(stays.session.messageFrom).toBe(MESSAGE);
  });

  test("a place on this device that the server says is gone falls back to the preaching", async () => {
    const player = mountPlayer([SAVED]);
    player.session.load(SERMON);
    player.flush();
    expect(player.session.start).toBe(250);
    player.session.offerOpening(SERMON.id, MESSAGE);
    player.flush();
    ready(player, 250);
    await player.answer([]);
    expect(player.commands).toEqual(["play", "seek:1340"]);
    expect(player.session.resumedFrom).toBe(0);
    expect(player.session.messageFrom).toBe(MESSAGE);
  });
});

test("when the app's own player fails before it starts, YouTube starts at the preaching too", () => {
  const player = mountPlayer([], { hls: true });
  player.session.load(SERMON, undefined, MESSAGE);
  player.flush();
  expect(player.session.engine).toBe("native");
  player.session.onEvent({ type: "error", code: 4 });
  player.flush();
  expect(player.session.engine).toBe("youtube");
  expect(player.session.start).toBe(MESSAGE);
  expect(player.session.messageFrom).toBe(MESSAGE);
});

test("on iOS, VoiceOver hears once that it started where the preaching starts", () => {
  const player = mountPlayer([], { hls: true, platform: "ios" });
  player.session.load(SERMON, undefined, MESSAGE);
  player.flush();
  ready(player, MESSAGE);
  player.session.onEvent({ type: "state", state: 2, seconds: MESSAGE + 5, duration: LENGTH });
  player.flush();
  player.session.onEvent({ type: "state", state: 1, seconds: MESSAGE + 5, duration: LENGTH });
  player.flush();
  expect(player.announced.filter((text) => text.startsWith("Started where"))).toEqual([
    "Started where the preaching starts, at 22 minutes 20 seconds.",
  ]);
});
