import { router, useNavigation, usePathname } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { requestWatch, useGo } from "../navigation";
import { usePlayerSession } from "../player/PlayerProvider";
import { useToast } from "../toast";
import { useAccount } from "./AccountProvider";
import {
  Intent,
  forgetEarlierIntent,
  registerIntentRunner,
  setPendingIntent,
  startPathForIntent,
  takePendingIntent,
  runIntent,
} from "./intent";

/**
 * Routes that belong to onboarding and sign-in. They stack over whatever the
 * viewer was doing and are all closed together when an account is ready.
 */
const FLOW_ROUTES = new Set([
  "welcome",
  "onboarding/topics",
  "onboarding/account",
  "onboarding/name",
  "onboarding/done",
  "join",
  "auth/email",
  "auth/code",
  "auth/password",
  "auth/reset",
  "auth/new-password",
  "auth/callback",
]);

export function isFlowRoute(name: string) {
  return FLOW_ROUTES.has(name);
}

/** The sign-in sheet and its steps, but not onboarding's own screens. */
function isAuthRoute(name: string) {
  return name === "join" || name.startsWith("auth/");
}

type RouteList = { name: string }[];

function trailing(routes: RouteList, match: (name: string) => boolean) {
  let count = 0;
  for (let i = routes.length - 1; i >= 0 && match(routes[i].name); i--) count += 1;
  return count;
}

/**
 * Closes the sign-in sheet and steps on top of onboarding, so onboarding
 * can continue underneath. Resolves once they've had time to close.
 */
export function useCloseAuthRoutes() {
  const navigation = useNavigation();
  return useCallback(async () => {
    const count = trailing((navigation.getState()?.routes ?? []) as RouteList, isAuthRoute);
    if (!count) return;
    router.dismiss(count);
    await new Promise((resolve) => setTimeout(resolve, Platform.OS === "web" ? 30 : 400));
  }, [navigation]);
}

type Viewer = ReturnType<typeof useAccount>;

/**
 * Whether this sermon plays without an account: everything when accounts
 * aren't available in a build or the remote setting opens playback, and
 * sermons opened from a shared link by default.
 */
function guestMayWatch(account: Viewer, sermonId: string) {
  return (
    account.mode === "unavailable" ||
    account.guestWatch === "all" ||
    (account.guestWatch === "shared" && account.hasPass(sermonId))
  );
}

/**
 * Guests browse freely; watching (unless the sermon came from a shared link)
 * and saving ask for a free account first. When accounts aren't available in
 * a build, watching stays open rather than locking everyone out.
 */
export function useGate() {
  const account = useAccount();
  const go = useGo();
  const canWatch = (sermonId: string) =>
    !!account.user || guestMayWatch(account, sermonId);

  /** True when the action may go ahead now; otherwise opens the sign-up sheet. */
  const require = (intent: Intent) => {
    if (intent.kind === "watch" && canWatch(intent.sermonId)) return true;
    if (account.user) return true;
    if (account.mode === "unavailable") return false;
    const id = setPendingIntent(intent) ?? undefined;
    const reason = intent.kind === "watch" && intent.path ? "path" : intent.kind;
    go.push({ pathname: "/join", params: { reason, intent: id } });
    return false;
  };

  return { canWatch, require };
}

/**
 * Closes every onboarding/sign-in screen on top of the app, then carries on
 * with what the viewer was doing (watch or save the sermon they tapped).
 */
export function useFinishFlow() {
  const navigation = useNavigation();
  return useCallback(async () => {
    const count = trailing((navigation.getState()?.routes ?? []) as RouteList, isFlowRoute);
    if (count) router.dismiss(count);
    // With none left to close, the viewer already closed them while the
    // sign-in finished (a swipe down, Back): going back now would close the
    // screen they returned to. Only a screen still on top steps back.
    else if (navigation.isFocused()) {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    }
    const intent = await takePendingIntent();
    // After the sheets have closed, so the player and toast land on the page.
    if (intent) setTimeout(() => runIntent(intent), Platform.OS === "web" ? 60 : 450);
  }, [navigation]);
}

/**
 * Carries out an intent: opens the sermon and starts it, or saves it. Saving
 * needs an account; watching goes ahead for anyone allowed to watch (a guest
 * too, when playback is open to them). Also stops a gated sermon when the
 * viewer signs out.
 */
export function IntentRunner() {
  const account = useAccount();
  const catalogue = useCatalogue();
  const session = usePlayerSession();
  const pathname = usePathname();
  const toast = useToast();
  const latest = useRef({ account, catalogue, session, pathname, toast });
  useEffect(() => {
    latest.current = { account, catalogue, session, pathname, toast };
  }, [account, catalogue, session, pathname, toast]);

  useEffect(() => {
    registerIntentRunner(async (intent) => {
      // After a web reload the library may still be loading.
      const find = () => latest.current.catalogue.find(intent.sermonId);
      for (let i = 0; i < 50 && !find() && !latest.current.catalogue.settled; i++)
        await new Promise((resolve) => setTimeout(resolve, 100));
      const sermon = find();
      if (!sermon) return;
      const allowed = (now: Viewer) =>
        !!now.user || (intent.kind === "watch" && guestMayWatch(now, sermon.id));
      const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
      // The account can take a moment to arrive after the sheet closes.
      for (let i = 0; i < 20 && !allowed(latest.current.account); i++) await pause();
      // A save waits for the account's saved list too (within reason), so
      // "already saved" is judged on the real list, and the save isn't
      // undone on screen by a list read before it.
      if (intent.kind === "save")
        for (let i = 0; i < 80 && !latest.current.account.loaded; i++) await pause();
      const { account: now, session: player, pathname: path, toast: show } = latest.current;
      if (!allowed(now)) return;
      if (intent.kind === "watch") {
        // A path's first day: the path starts for the new account too.
        if (intent.path) startPathForIntent(intent.path.id);
        const at = intent.at != null ? Math.max(0, Math.floor(intent.at)) : undefined;
        if (path !== `/sermon/${sermon.id}`) {
          const params: Record<string, string> = { id: sermon.id };
          if (at != null) params.t = String(at);
          if (intent.path) {
            params.path = intent.path.id;
            params.day = String(intent.path.day);
          }
          // The sermon page starts it once it has settled, at `t`.
          requestWatch(sermon.id);
          router.navigate({ pathname: "/sermon/[id]", params } as never);
          return;
        }
        player.load(sermon, at);
        return;
      }
      if (now.isSaved(sermon.id)) {
        show("Already saved", "bookmark");
        return;
      }
      try {
        await now.setSaved(sermon.id, true);
        // Seen and announced, like a save made with the Save button.
        show("Saved", "bookmark");
      } catch {
        show("Couldn’t save. Check your connection.", "alert-circle-outline");
      }
    });
    return () => registerIntentRunner(null);
  }, []);

  // An intent left from an earlier launch (the app or tab closed part-way
  // through signing up) mustn't replay after some later, unrelated sign-in.
  // Launching into the sign-up sheet or a sign-in step (a web reload, an
  // email link) is that same attempt carrying on, so it keeps it.
  const launchPath = useRef(pathname);
  useEffect(() => {
    const path = launchPath.current;
    if (path !== "/join" && !path.startsWith("/auth/")) forgetEarlierIntent();
  }, []);

  // Signing out stops a sermon the viewer could only watch with an account.
  const signedIn = !!account.user;
  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) {
      const current = session.sermon;
      if (current && !guestMayWatch(account, current.id)) session.close();
    }
    wasSignedIn.current = signedIn;
  }, [signedIn, session, account]);

  return null;
}
