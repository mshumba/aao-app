import Constants from "expo-constants";
import { Href } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextStyle,
  View,
} from "react-native";
import { useAccount, useSaved } from "../../auth/AccountProvider";
import type { Provider } from "../../auth/types";
import { AccountBenefits, FormAlert, useAuthTask } from "../../auth/ui";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { getCategory } from "../../data/categories";
import { Card, ListGroup, ListRow } from "../../kit";
import { useGo, usePageTitle } from "../../navigation";
import { font, radius, space, textCap, type } from "../../theme";
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
  Tap,
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
 * Account, in the Immersive look: who you are first (a navy avatar, your
 * name, or your email when there's none, in the serif as the page's
 * heading) or, for a guest, the same row saying "Account" over a sand card
 * inviting a free account. Settings sit in white grouped cards (your name,
 * then your library, then about); signing out is a small centred pill,
 * deleting the account a plain red row set apart, still on this screen as
 * the App Store asks.
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
  const { saved: savedIds, savedError } = useSaved();
  const saved = savedIds.filter((id) => catalogue.find(id)).length;

  const library: Row[] = [
    ...(user
      ? [
          {
            title: "Saved sermons",
            icon: "bookmark-outline",
            route: "/saved",
            value: !loaded
              ? undefined
              : savedError
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
  ];

  // Right under who you are: the one thing about you to change.
  const name: Row = {
    title: "Name",
    icon: "person-outline",
    route: "/account/name",
    value: account.profile
      ? account.displayName?.trim() || "Not set"
      : account.profileError
        ? "Couldn’t load"
        : undefined,
  };

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
      {!account.ready ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading your account" />
        </View>
      ) : user ? (
        <Profile />
      ) : account.mode === "unavailable" ? (
        <>
          <GuestHeader />
          <ComingSoonCard />
        </>
      ) : (
        <>
          <GuestHeader signedOut />
          <GuestCard />
        </>
      )}

      {user && <ListGroup style={styles.nameGroup}>{rows([name])}</ListGroup>}
      {account.ready && (
        <ListGroup title={user ? "Library" : "On this device"} style={styles.group}>
          {rows(library)}
        </ListGroup>
      )}
      <ListGroup title="About" style={styles.group}>
        {rows(about)}
      </ListGroup>

      {user && (
        <>
          <View style={styles.signOut}>
            <FormAlert message={task.error} />
            <SignOutPill busy={task.busy === "sign-out"} onPress={signOut} />
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

/**
 * Who's signed in: the navy avatar, then the name (or the email, when
 * there's no name) in the serif as the page's heading, the email under a
 * name, and how this session signed in.
 */
function Profile() {
  const account = useAccount();
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
        <Heading
          level={1}
          // An address wraps after its "@" when it must, not mid-word.
          accessibilityLabel={name ?? user.email ?? "Your account"}
          style={[styles.name, wrapAnywhere]}
          maxFontSizeMultiplier={textCap.display}
        >
          {name ?? user.email?.replace("@", "@\u200b") ?? "Your account"}
        </Heading>
        {name && user.email ? (
          <T style={[styles.email, wrapAnywhere]}>{user.email}</T>
        ) : null}
        <View style={styles.provider}>
          <Icon name={via.icon} size={15} color={c.muted} />
          <T style={s.meta}>{via.label}</T>
        </View>
      </View>
    </View>
  );
}

/**
 * Without an account, the page is headed as a profile is, in the same row:
 * an empty avatar, "Account" in the serif, and that no one is signed in.
 */
function GuestHeader({ signedOut = false }: { signedOut?: boolean }) {
  return (
    <View style={styles.profile}>
      {/* Decorative, as a profile's avatar is. */}
      <View
        style={[styles.avatar, styles.guestAvatar]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...web({ "aria-hidden": true })}
      >
        <Icon name="person-outline" color={c.accent} size={26} />
      </View>
      <View style={styles.profileText}>
        <Heading level={1} style={styles.name} maxFontSizeMultiplier={textCap.display}>
          Account
        </Heading>
        {signedOut ? <T style={s.meta}>Not signed in</T> : null}
      </View>
    </View>
  );
}

/** Sign out: a small outlined pill, centred under the settings (40pt, 44pt to touch). */
function SignOutPill({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <Tap
      testID="sign-out"
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      aria-disabled={busy}
      aria-busy={busy}
      disabled={busy}
      busy={busy}
      onPress={onPress}
      hitSlop={{ top: 2, bottom: 2 }}
      style={styles.signOutPill}
    >
      {busy ? (
        <ActivityIndicator color={c.accent} size="small" />
      ) : (
        <Icon name="log-out-outline" size={16} color={c.accent} />
      )}
      <T style={styles.signOutText} maxFontSizeMultiplier={textCap.chip}>
        Sign out
      </T>
    </Tap>
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
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  profile: { marginTop: space.xl, flexDirection: "row", alignItems: "center", gap: space.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  // Empty: a white well with a navy outline glyph, where a profile's is navy.
  guestAvatar: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  initials: {
    fontFamily: font.serifItalic,
    fontSize: type.sectionSmall.fontSize,
    lineHeight: 28,
    color: c.onAccent,
  },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.sectionSmall, color: c.text },
  email: { ...type.body, color: c.text },
  provider: { flexDirection: "row", alignItems: "center", gap: 6 },
  invite: { marginTop: space.xl, gap: space.lg },
  inviteTitle: { ...type.sectionSmall, color: c.text },
  actions: { gap: space.md },
  nameGroup: { marginTop: space.xl },
  group: { marginTop: space.xxl },
  signOut: { marginTop: space.xxl, gap: space.md },
  signOutPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 40,
    paddingHorizontal: space.s20,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  signOutText: { ...type.label, color: c.accent },
  danger: { marginTop: space.xl },
});
