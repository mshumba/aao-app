import Constants from "expo-constants";
import { Href } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextStyle,
  View,
} from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import type { Provider } from "../../auth/types";
import { AccountBenefits, FormAlert, useAuthTask } from "../../auth/ui";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { getCategory } from "../../data/categories";
import { Card, ListGroup, ListRow } from "../../kit";
import { useGo, usePageTitle } from "../../navigation";
import { font, space, textCap, type } from "../../theme";
import { useToast } from "../../toast";
import { sermonCount } from "../../topics";
import {
  Button,
  Heading,
  Icon,
  IconName,
  Notice,
  Page,
  T,
  TextButton,
  c,
  s,
  web,
} from "../../ui";

type Row = {
  title: string;
  icon: IconName;
  route: Href;
  /** The current setting, shown under the title and read with it. */
  value?: string;
  hint?: string;
  danger?: boolean;
  testID?: string;
};

const provider: Record<Provider, { label: string; icon: IconName }> = {
  apple: { label: "Signed in with Apple", icon: "logo-apple" },
  google: { label: "Signed in with Google", icon: "logo-google" },
  email: { label: "Signed in with email", icon: "mail-outline" },
};

const version = Constants.expoConfig?.version;

/**
 * Account, in the Immersive look: "Account" as the gold kicker (the page's
 * heading, as "Paths" is on its tab), then who you are (a navy avatar and
 * your name in the serif) or, for a guest, a sand card inviting a free
 * account. Settings sit in white grouped cards; signing out is a quiet
 * pill, deleting the account a red row set apart.
 */
export default function AccountTab() {
  usePageTitle("Account");
  const account = useAccount();
  const toast = useToast();
  const task = useAuthTask();
  const go = useGo();
  const user = account.user;
  // The profile and saved list arrive a moment after the session.
  const loaded = account.loaded;

  const topics = account.interests
    .map((id) => getCategory(id)?.label)
    .filter(Boolean)
    .join(", ");
  const catalogue = useCatalogue();
  const saved = account.saved.filter((id) => catalogue.find(id)).length;

  const yours: Row[] = [
    ...(user
      ? [
          {
            title: "Saved sermons",
            icon: "bookmark-outline",
            route: "/saved",
            value: !loaded
              ? undefined
              : account.savedError
                ? "Couldn’t load"
                : sermonCount(saved, "None yet"),
          } satisfies Row,
        ]
      : []),
    {
      title: "Your topics",
      icon: "albums-outline",
      route: "/account/topics",
      value: topics || "Not set",
    },
    ...(user
      ? [
          {
            title: "Name",
            icon: "person-outline",
            route: "/account/name",
            value: account.profile
              ? account.displayName?.trim() || "Not set"
              : account.profileError
                ? "Couldn’t load"
                : undefined,
          } satisfies Row,
        ]
      : []),
  ];

  const about: Row[] = [
    { title: "About AAO", icon: "information-circle-outline", route: "/about" },
    { title: "Privacy Policy", icon: "shield-checkmark-outline", route: "/privacy" },
    { title: "Terms of Use", icon: "document-text-outline", route: "/terms" },
    ...(__DEV__
      ? [
          {
            title: "Sample screens",
            icon: "flask-outline",
            route: "/states",
            hint: "Loading, offline and error examples",
          } satisfies Row,
        ]
      : []),
  ];

  async function signOut() {
    const done = await task.run("sign-out", async () => {
      await account.signOut();
      return true;
    });
    if (done) toast("Signed out");
  }

  const rows = (list: Row[]) =>
    list.map((row) => (
      <ListRow
        key={row.title}
        testID={row.testID}
        icon={row.icon}
        title={row.title}
        value={row.value}
        hint={row.hint}
        danger={row.danger}
        onPress={() => go.push(row.route)}
      />
    ));

  return (
    <Page>
      <Heading level={1} style={styles.kicker} maxFontSizeMultiplier={textCap.section}>
        Account
      </Heading>

      {!account.ready ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading your account" />
        </View>
      ) : user ? (
        <Profile />
      ) : account.mode === "unavailable" ? (
        <ComingSoonCard />
      ) : (
        <GuestCard />
      )}

      {account.ready && (
        <ListGroup title={user ? "Your account" : "On this device"} style={styles.group}>
          {rows(yours)}
        </ListGroup>
      )}
      <ListGroup title="About" style={styles.group}>
        {rows(about)}
      </ListGroup>

      {user && (
        <>
          <View style={styles.signOut}>
            <FormAlert message={task.error} />
            <Button
              testID="sign-out"
              label="Sign out"
              icon="log-out-outline"
              variant="secondary"
              busy={task.busy === "sign-out"}
              onPress={signOut}
            />
          </View>
          <ListGroup style={styles.danger}>
            {rows([
              {
                title: "Delete account",
                icon: "trash-outline",
                route: "/account/delete",
                danger: true,
                testID: "delete-account-row",
              },
            ])}
          </ListGroup>
        </>
      )}

      {version ? (
        <T style={[s.meta, { marginTop: space.xxl }]}>{`Version ${version}`}</T>
      ) : null}
    </Page>
  );
}

/** "Mufaro Shumba" → "MS", "mufaro" → "M"; the email's first letter without a name. */
function initials(name: string | null, email: string | null) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const parts = words.length
    ? [words[0], words.length > 1 ? words[words.length - 1] : ""]
    : [email ?? ""];
  // Array.from keeps a letter outside the basic plane in one piece.
  return parts
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

/** Who's signed in: the navy avatar, the name in the serif, the email and how. */
function Profile() {
  const account = useAccount();
  const go = useGo();
  const user = account.user;
  if (!user) return null;
  const name = account.displayName?.trim() || null;
  const letters = initials(name, user.email);
  const via = provider[user.provider];
  return (
    <View style={styles.profile}>
      {/* Decorative: the name or email beside it says who this is. */}
      <View
        style={styles.avatar}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...web({ "aria-hidden": true })}
      >
        {letters ? (
          <T style={styles.initials} maxFontSizeMultiplier={1.3}>
            {letters}
          </T>
        ) : (
          <Icon name="person" color={c.onAccent} size={26} />
        )}
      </View>
      <View style={styles.profileText}>
        <Heading level={2} style={styles.name} maxFontSizeMultiplier={textCap.display}>
          {name ?? "Your account"}
        </Heading>
        {user.email ? (
          <T style={[styles.email, wrapAnywhere]}>{user.email}</T>
        ) : null}
        <View style={styles.provider}>
          <Icon name={via.icon} size={15} color={c.muted} />
          <T style={s.meta}>{via.label}</T>
        </View>
        {!name && account.profile ? (
          <TextButton
            label="Add your name"
            icon="chevron-forward"
            align="start"
            onPress={() => go.push("/account/name")}
          />
        ) : null}
      </View>
    </View>
  );
}

function GuestCard() {
  const account = useAccount();
  const go = useGo();
  return (
    <Card tone="sand" style={styles.invite}>
      <Heading level={2} style={styles.inviteTitle} maxFontSizeMultiplier={textCap.section}>
        Create your free account
      </Heading>
      <AccountBenefits />
      <View style={styles.actions}>
        <Button
          label="Create free account"
          onPress={() =>
            go.push({ pathname: "/join", params: { reason: "account" } })
          }
        />
        <Button
          label="Sign in"
          variant="secondary"
          onPress={() =>
            go.push({ pathname: "/join", params: { mode: "sign-in" } })
          }
        />
      </View>
      {account.mode === "local" && (
        <Notice icon="flask-outline">
          Test mode: accounts stay on this device.
        </Notice>
      )}
    </Card>
  );
}

/** A release build without an account service: say so, and that nothing is locked. */
function ComingSoonCard() {
  return (
    <Card tone="sand" style={styles.invite}>
      <Heading level={2} style={styles.inviteTitle} maxFontSizeMultiplier={textCap.section}>
        Accounts are coming soon
      </Heading>
      <T style={s.body}>You can browse and watch every sermon without one.</T>
    </Card>
  );
}

// Long addresses (Apple's private relay ones have no spaces) wrap rather than
// pushing the page sideways on narrow web viewports.
const wrapAnywhere =
  Platform.OS === "web"
    ? ({ wordBreak: "break-word", overflowWrap: "anywhere" } as unknown as TextStyle)
    : null;

const styles = StyleSheet.create({
  kicker: { ...type.overline, color: c.gold, marginTop: space.xl },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  profile: { marginTop: space.lg, gap: space.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: font.serifItalic,
    fontSize: type.sectionSmall.fontSize,
    lineHeight: 28,
    color: c.onAccent,
  },
  profileText: { gap: 4 },
  name: { ...type.title, color: c.text },
  email: { ...type.body, color: c.text },
  provider: { flexDirection: "row", alignItems: "center", gap: 6 },
  invite: { marginTop: space.lg, gap: space.lg },
  inviteTitle: { ...type.sectionSmall, color: c.text },
  actions: { gap: space.md },
  group: { marginTop: space.xxl },
  signOut: { marginTop: space.xxl, gap: space.md },
  danger: { marginTop: space.xl },
});
