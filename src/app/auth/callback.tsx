import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccount } from "../../auth/AccountProvider";
import { useCloseAuthRoutes, useFinishFlow } from "../../auth/gate";
import {
  runIntent,
  setPendingIntent,
  takeAuthReturn,
  takePendingIntent,
} from "../../auth/intent";
import { authMessage } from "../../auth/messages";
import { UNAVAILABLE_TITLE } from "../../auth/screens/shared";
import { exitTo, firstParam, useGo } from "../../navigation";
import { space, type } from "../../theme";
import { useToast } from "../../toast";
import { Heading, StatePanel, c, s } from "../../ui";

/** How long to wait for the session before calling it a failure. */
const WAIT_MS = 10_000;

/**
 * Where Apple and Google (on the web) and email links return, with a code
 * to exchange for a session or an error. Once signed in it continues where
 * the sign-in began: choosing a new password after a reset link, the name
 * step when it began in onboarding, or else what was tapped before leaving
 * the app, if anything.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const account = useAccount();
  const navigation = useNavigation();
  const finish = useFinishFlow();
  const closeAuth = useCloseAuthRoutes();
  const toast = useToast();
  const go = useGo();
  const code = firstParam(params.code);
  const [failure, setFailure] = useState(() =>
    providerFailure(firstParam(params.error), firstParam(params.error_description)),
  );
  const done = useRef(false);
  const exchanged = useRef(false);
  const unavailable = account.mode === "unavailable";
  // What the link was, once its code is exchanged: a password reset goes on
  // to choosing a new password. Without a code there's nothing to learn.
  const [link, setLink] = useState<"pending" | "sign-in" | "recovery">(
    code ? "pending" : "sign-in",
  );

  // Exchange the code once the saved session is known. It may already be
  // signed in (supabase-js exchanges a web redirect's code on load); the
  // exchange still reports whether the link was a reset.
  useEffect(() => {
    if (failure || unavailable || !account.ready || exchanged.current || !code) return;
    exchanged.current = true;
    account.exchangeCode(code).then(
      (result) =>
        setLink(result.status === "signedIn" && result.recovery ? "recovery" : "sign-in"),
      (error) => {
        if (!done.current) setFailure(authMessage(error));
      },
    );
  }, [account, code, failure, unavailable]);

  useEffect(() => {
    if (failure || unavailable) return;
    const timer = setTimeout(() => {
      if (!done.current)
        setFailure("Signing in took too long. Check your connection and try again.");
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [failure, unavailable]);

  // Signed in: close this (and any sign-in steps under it) and carry on.
  const signedIn = !!account.user;
  useEffect(() => {
    if (!signedIn || failure || link === "pending" || done.current) return;
    done.current = true;
    (async () => {
      const resume = await takeAuthReturn();
      if (link === "recovery") {
        // Signed in by the link; the new password is still to choose.
        router.replace({
          pathname: "/auth/new-password",
          params: { next: resume === "onboarding" ? "onboarding" : "resume" },
        });
        return;
      }
      if (resume === "onboarding") {
        // The sign-in began in onboarding (a web sign-in reloads the app on
        // the way back): close the sign-in steps and carry on with it.
        await closeAuth();
        router.push("/onboarding/name");
        return;
      }
      const routes = navigation.getState()?.routes ?? [];
      if (routes.length > 1) {
        await finish();
      } else {
        router.replace("/");
        const intent = await takePendingIntent();
        if (intent)
          setTimeout(() => runIntent(intent), Platform.OS === "web" ? 60 : 450);
      }
      toast("You’re signed in");
    })();
  }, [signedIn, failure, link, navigation, finish, closeAuth, toast]);

  // Back to the sheet, naming the sermon again if one was tapped.
  function retry() {
    go.run(async () => {
      const intent = await takePendingIntent();
      if (intent) setPendingIntent(intent);
      router.replace(
        intent
          ? { pathname: "/join", params: { reason: intent.kind, sermon: intent.sermonId } }
          : "/join",
      );
    });
  }

  if (unavailable)
    return (
      <Frame>
        <StatePanel
          level={1}
          icon="person-circle-outline"
          title={UNAVAILABLE_TITLE}
          body="Accounts aren’t available in this build yet."
          label="Go to Home"
          action={() => exitTo("/")}
        />
      </Frame>
    );

  if (failure)
    return (
      <Frame>
        <StatePanel
          level={1}
          tone="error"
          icon="alert-circle-outline"
          title="Sign-in didn’t finish"
          body={failure}
          label="Try again"
          action={retry}
          secondaryLabel="Go to Home"
          secondaryAction={() => exitTo("/")}
        />
      </Frame>
    );

  return (
    <Frame>
      <View style={styles.waiting}>
        <ActivityIndicator color={c.accent} size="large" />
        <Heading level={1} style={styles.waitingText}>
          Signing you in…
        </Heading>
      </View>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={s.safe}>
      <View style={styles.frame}>{children}</View>
    </SafeAreaView>
  );
}

/**
 * The provider's own error, in a sentence that says what to do. Its
 * description comes from the link, so only a short, plain version is shown.
 */
function providerFailure(error?: string, description?: string) {
  if (!error && !description) return null;
  const what =
    error === "access_denied"
      ? "Sign-in was cancelled before it finished."
      : "The sign-in service couldn’t finish signing you in.";
  // A cancel needs no detail; anything else may help support.
  const detail = error === "access_denied" ? "" : tidy(description);
  const message = `${what} Try again, or choose another way to sign in.`;
  return detail ? `${message}\n\nDetails: ${detail}` : message;
}

function tidy(text?: string) {
  if (!text) return "";
  const plain = text
    .replace(/\+/g, " ")
    .replace(/[^A-Za-z0-9 .,'’:;()_-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 120 ? `${plain.slice(0, 119).trimEnd()}…` : plain;
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.gutter,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  waiting: { alignItems: "center", gap: space.lg },
  waitingText: { ...type.label, color: c.muted, textAlign: "center" },
});
