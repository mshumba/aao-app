import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * Who the test starts as. The web server runs the on-device stand-in account
 * service (EXPO_PUBLIC_AUTH_MODE=local), so nothing leaves the browser.
 * - member: signed in as mufaro@example.com, onboarding done (the default,
 *   so playback tests can press Watch without the sign-up sheet);
 * - guest: onboarding done, no account;
 * - new: a first launch (the welcome shows).
 */
export type Viewer = "member" | "guest" | "new";

export const MEMBER = {
  id: "local:mufaro@example.com",
  email: "mufaro@example.com",
  provider: "email",
};

export const test = base.extend<{ viewer: Viewer }>({
  viewer: ["member", { option: true }],
  page: async ({ page, viewer }, use) => {
    // Navigation/privacy tests must not depend on remote thumbnail
    // availability. Player failure behavior is exercised in core.spec.ts.
    await page.route(
      /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//,
      (route) => route.abort(),
    );
    // Seed storage once per tab, before the app's first load; later reloads
    // in the same test keep whatever the app stored since.
    await page.addInitScript(
      ({ viewer, member }) => {
        if (sessionStorage.getItem("__aao_seeded")) return;
        sessionStorage.setItem("__aao_seeded", "1");
        if (viewer === "new") return;
        localStorage.setItem(
          "aao.onboarding.v1",
          JSON.stringify({ welcomed: true, interests: [] }),
        );
        if (viewer === "member")
          localStorage.setItem("aao.local.session.v1", JSON.stringify(member));
      },
      { viewer, member: MEMBER },
    );
    await use(page);
  },
});
export { expect };

/** The code the local account service always accepts. */
export const CODE = "123456";

/**
 * Screens behind the current one (inactive tabs, pushed-over screens) stay in
 * the DOM on web but are aria-hidden. Keep only what's actually on screen.
 */
export function shown(locator: Locator) {
  return locator.locator(
    'xpath=self::*[not(ancestor-or-self::*[@aria-hidden="true"])]',
  ).filter({ visible: true });
}

export function rows(page: Page) {
  return shown(page.getByTestId("sermon-row"));
}

export function tab(page: Page, name: "Home" | "Topics" | "Search" | "Account") {
  return page.getByRole("tab", { name, exact: true });
}

/**
 * Replace YouTube's IFrame API with a deterministic stand-in: a 10-minute
 * video whose clock ticks while playing. Commands the app sends through the
 * official API, and each player's `start`, are recorded on window.__yt for
 * assertions. Like the real API, player methods only exist once it's ready.
 * - error: fail with this YouTube error code instead of becoming ready.
 * - readyAfter: milliseconds before ready (or the error).
 * - stallFirst: the first script load never defines a player, as when
 *   YouTube's follow-up script is blocked.
 * - blockAutoplay: the first play request is refused, as Safari does when
 *   the tap that asked for playback came before the player existed:
 *   "silent" (no state change), "paused" (buffers, then pauses) or "stall"
 *   (buffers forever). `true` means "silent".
 */
export async function fakeYouTube(
  page: Page,
  options:
    | number
    | {
        error?: number;
        readyAfter?: number;
        stallFirst?: boolean;
        blockAutoplay?: boolean | "silent" | "paused" | "stall";
      } = {},
) {
  const { error, readyAfter = 50, stallFirst = false, blockAutoplay = false } =
    typeof options === "number" ? { error: options } : options;
  let loads = 0;
  await page.route("https://www.youtube.com/iframe_api", (route) => {
    loads += 1;
    if (stallFirst && loads === 1)
      return route.fulfill({
        contentType: "text/javascript",
        body: "window.YT = { loading: 1, loaded: 0 };",
      });
    return route.fulfill({
      contentType: "text/javascript",
      body: `window.__yt = window.__yt || { created: 0, destroyed: 0, commands: [], starts: [] };
      window.YT = { Player: function (el, o) {
        var yt = window.__yt, self = this, state = -1, t = (o.playerVars && o.playerVars.start) || 0, timer, pend = [], refuse = ${JSON.stringify(blockAutoplay === true ? "silent" : blockAutoplay || "")};
        yt.created++; yt.starts.push(t);
        el.setAttribute("data-testid", "fake-yt");
        el.style.width = "100%"; el.style.height = "100%";
        el.innerHTML = '<iframe title="Fake YouTube player" style="width:100%;height:100%;border:0;background:#000"></iframe>';
        function emit(s) { state = s; o.events.onStateChange({ data: s }); }
        this.destroy = function () { clearInterval(timer); yt.destroyed++; };
        function attach() {
          self.getCurrentTime = function () { return t; };
          self.getDuration = function () { return 600; };
          self.getPlayerState = function () { return state; };
          self.playVideo = function () {
            if (refuse) {
              var how = refuse; refuse = "";
              yt.commands.push("play-refused");
              if (how === "paused") { setTimeout(function () { emit(3); }, 30); setTimeout(function () { emit(2); }, 120); }
              if (how === "stall") setTimeout(function () { emit(3); }, 30);
              return;
            }
            yt.commands.push("play"); clearInterval(timer);
            // Like YouTube: a moment of buffering, then playing.
            pend.push(setTimeout(function () { emit(3); }, 20));
            pend.push(setTimeout(function () { timer = setInterval(function () { t += 1; }, 200); emit(1); }, 80));
          };
          self.pauseVideo = function () { yt.commands.push("pause"); pend.forEach(clearTimeout); pend = []; clearInterval(timer); emit(2); };
          self.seekTo = function (s) { yt.commands.push("seek:" + Math.round(s)); t = s; };
          self.setPlaybackRate = function (r) { yt.commands.push("rate:" + r); o.events.onPlaybackRateChange({ data: r }); };
        }
        setTimeout(function () { ${error ? `o.events.onError({ data: ${error} })` : "attach(); o.events.onReady()"}; }, ${readyAfter});
      } };
      window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();`,
    });
  });
}

/** Pretend the viewer switched away from the app (the tab is hidden). */
export async function sendToBackground(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

export async function ytLog(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __yt?: { created: number; destroyed: number; commands: string[]; starts: number[] };
        }
      ).__yt ?? { created: 0, destroyed: 0, commands: [], starts: [] },
  );
}

/**
 * The connection drops: navigator.onLine reads false (before the next load
 * too, and now if a page is open), which the stand-in account service
 * treats like the real one being out of reach. The app itself still loads
 * from the dev server. goOnline brings it back, as the browser would.
 */
export async function goOffline(page: Page) {
  const drop = (now: boolean) => {
    try {
      if (now || !sessionStorage.getItem("__aao_net"))
        sessionStorage.setItem("__aao_net", "offline");
    } catch {
      // No storage on about:blank; the next load sets it.
    }
    Object.defineProperty(Navigator.prototype, "onLine", {
      configurable: true,
      get: () => {
        try {
          return sessionStorage.getItem("__aao_net") !== "offline";
        } catch {
          return true;
        }
      },
    });
    if (now) window.dispatchEvent(new Event("offline"));
  };
  await page.addInitScript(drop, false);
  if (page.url().startsWith("http")) await page.evaluate(drop, true);
}

export async function goOnline(page: Page) {
  await page.evaluate(() => {
    sessionStorage.setItem("__aao_net", "online");
    window.dispatchEvent(new Event("online"));
  });
}
