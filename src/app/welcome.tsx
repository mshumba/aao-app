import { useNavigation } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../auth/AccountProvider";
import { useFinishFlow } from "../auth/gate";
import { SwitchLine } from "../auth/screens/shared";
import { FlowButton } from "../auth/ui";
import { useReducedMotion } from "../motion";
import { useGo, usePageTitle } from "../navigation";
import { ArtworkCollage } from "../onboarding/ArtworkCollage";
import { motion } from "../onboarding/parts";
import { easeOut, font, space, type } from "../theme";
import { Heading, T, TextButton, c, s } from "../ui";

// How far the artwork's fade runs on under the words.
const BLEED = 64;
// The artwork never shrinks below this, even when the words need scrolling.
const MIN_ART = 200;

/**
 * First launch, over the tabs: the sermons' artwork, what the app is for,
 * and three ways in. Browsing never needs an account, so exploring first is
 * as easy to find as getting started.
 */
export default function Welcome() {
  usePageTitle("Welcome");
  const account = useAccount();
  const go = useGo();
  const finish = useFinishFlow();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // The entrance plays once, as it started, even if the setting changes.
  const live = useReducedMotion();
  const [reduced] = useState(live);

  // However the welcome closes (Explore first, Android's Back button, or
  // the end of onboarding), it has been seen and doesn't return.
  const { finishWelcome } = account;
  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        finishWelcome().catch(() => {});
      }),
    [navigation, finishWelcome],
  );

  const explore = () =>
    go.run(async () => {
      await account.finishWelcome();
      await finish();
    });

  const unavailable = account.mode === "unavailable";
  const footnote = unavailable
    ? "Browsing and watching are open to everyone."
    : account.guestWatch === "all"
      ? "Browsing and watching are open to everyone. A free account lets you save sermons."
      : "Browsing is open to everyone. A free account lets you watch and save sermons.";

  return (
    <View style={s.safe}>
      <ScrollView
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={styles.scroll}
      >
        <View
          style={[styles.art, { minHeight: MIN_ART, maxHeight: Math.round(height * 0.6) }]}
        >
          <ArtworkCollage bleed={BLEED} reduced={reduced} />
        </View>

        <View
          style={[
            styles.column,
            { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm },
          ]}
        >
          <Rise delay={240} reduced={reduced}>
            <View style={styles.wordmark}>
              <View style={s.wordmarkLine} />
              <T style={s.wordmarkText}>Arome Osayi</T>
            </View>
          </Rise>
          <Rise delay={300} reduced={reduced} style={styles.words}>
            <Heading level={1} style={styles.hero} maxFontSizeMultiplier={1.4}>
              Teaching that <Text style={styles.emphasis}>builds</Text> you up
            </Heading>
            <T style={s.lead}>
              Watch messages by Apostle Arome Osayi, gathered by how they edify.
            </T>
          </Rise>
          <Rise delay={380} reduced={reduced} style={styles.actions}>
            <FlowButton
              label="Get started"
              testID="welcome-get-started"
              onPress={() => go.push("/onboarding/topics")}
            />
            <View>
              {!unavailable && (
                <SwitchLine
                  prompt="Already have an account?"
                  label="Sign in"
                  testID="welcome-sign-in"
                  onPress={() =>
                    go.push({
                      pathname: "/join",
                      params: { mode: "sign-in", next: "onboarding" },
                    })
                  }
                />
              )}
              <TextButton
                label="Explore first"
                testID="welcome-explore"
                onPress={explore}
              />
            </View>
            <T style={styles.footnote}>{footnote}</T>
          </Rise>
        </View>
      </ScrollView>
    </View>
  );
}

/** Text arriving after the artwork: up 8pt, or a plain fade. */
function Rise({
  delay,
  reduced,
  style,
  children,
}: {
  delay: number;
  reduced: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Animated.View
      style={[
        style,
        {
          animationName: reduced ? motion.fade : motion.rise,
          animationDuration: reduced ? 200 : 300,
          animationDelay: delay,
          animationTimingFunction: easeOut,
          animationFillMode: "backwards",
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The artwork takes whatever height the words leave (within limits); on
  // very tall screens the spare room falls between the two.
  scroll: { flexGrow: 1, justifyContent: "space-between" },
  art: { flexGrow: 1 },
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: space.gutter,
    gap: space.lg,
  },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 10 },
  words: { gap: space.md },
  hero: type.hero,
  emphasis: { fontFamily: font.serifItalic },
  actions: { gap: space.sm, marginTop: space.lg },
  footnote: { ...type.caption, color: c.muted, textAlign: "center" },
});
