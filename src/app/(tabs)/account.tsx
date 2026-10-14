import Constants from "expo-constants";
import { Href } from "expo-router";
import { Fragment } from "react";
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
import { getCategory } from "../../data/categories";
import { sermons } from "../../data/sermons";
import { useGo } from "../../navigation";
import { font, radius, space, type } from "../../theme";
import { useToast } from "../../toast";
import { sermonCount } from "../../topics";
import {
  Button,
  Heading,
  Icon,
  IconName,
  Notice,
  Page,
  PageTitle,
  T,
  Tap,
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

export default function AccountTab() {
  const account = useAccount();
  const toast = useToast();
  const task = useAuthTask();
  const user = account.user;
  // The profile and saved list arrive a moment after the session.
  const loaded = account.loaded;

  const topics = account.interests
    .map((id) => getCategory(id)?.label)
    .filter(Boolean)
    .join(", ");
  const saved = account.saved.filter((id) =>
    sermons.some((sermon) => sermon.id === id),
  ).length;

  const library: Row[] = [
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

  return (
    <Page>
      <PageTitle title="Account" />

      {!account.ready ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading your account" />
        </View>
      ) : user ? (
        <ProfileCard />
      ) : account.mode === "unavailable" ? (
        <ComingSoonCard />
      ) : (
        <GuestCard />
      )}

      {account.ready && (
        <Group title={user ? "Your library" : "On this device"} rows={library} />
      )}
      <Group title="About" rows={about} />

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
          <Group
            rows={[
              {
                title: "Delete account",
                icon: "trash-outline",
                route: "/account/delete",
                danger: true,
                testID: "delete-account-row",
              },
            ]}
          />
        </>
      )}

      {version ? (
        <T style={[s.meta, { marginTop: space.xxl }]}>{`Version ${version}`}</T>
      ) : null}
    </Page>
  );
}

/** "Mufaro Shumba" → "MS", "ada" → "A"; the email's first letter without a name. */
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

function ProfileCard() {
  const account = useAccount();
  const go = useGo();
  const user = account.user;
  if (!user) return null;
  const name = account.displayName?.trim() || null;
  const letters = initials(name, user.email);
  const via = provider[user.provider];
  return (
    <View style={[styles.card, styles.profile]}>
      {/* Decorative: the name or email beside it says who this is. */}
      <View
        style={styles.avatar}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...web({ "aria-hidden": true })}
      >
        {letters ? (
          <T style={styles.initials} maxFontSizeMultiplier={1.4}>
            {letters}
          </T>
        ) : (
          <Icon name="person" color={c.accent} size={26} />
        )}
      </View>
      <View style={styles.profileText}>
        {name ? (
          <Heading level={2} style={styles.name}>
            {name}
          </Heading>
        ) : account.profile ? (
          <TextButton
            label="Add your name"
            align="start"
            onPress={() => go.push("/account/name")}
          />
        ) : null}
        {user.email ? (
          <T style={[styles.email, wrapAnywhere]}>{user.email}</T>
        ) : null}
        <View style={styles.provider}>
          <Icon name={via.icon} size={14} color={c.muted} />
          <T style={s.meta}>{via.label}</T>
        </View>
      </View>
    </View>
  );
}

function GuestCard() {
  const account = useAccount();
  const go = useGo();
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Icon name="person-outline" color={c.accent} size={26} />
        </View>
        <Heading level={2} style={styles.cardTitle}>
          Create your free account
        </Heading>
      </View>
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
    </View>
  );
}

/** A release build without an account service: say so, and that nothing is locked. */
function ComingSoonCard() {
  return (
    <View style={[styles.card, styles.cardHead]}>
      <View style={styles.avatar}>
        <Icon name="time-outline" color={c.accent} size={26} />
      </View>
      <View style={{ flex: 1, gap: space.xs }}>
        <Heading level={2} style={styles.cardTitle}>
          Accounts are coming soon
        </Heading>
        <T style={s.body}>You can browse and watch every sermon without one.</T>
      </View>
    </View>
  );
}

/** Rows that share one surface, under an optional small caps title. */
function Group({ title, rows }: { title?: string; rows: Row[] }) {
  const go = useGo();
  return (
    <View style={[styles.group, !title && { marginTop: space.xl }]}>
      {title ? (
        <Heading level={2} style={styles.groupTitle}>
          {title}
        </Heading>
      ) : null}
      <View style={styles.list}>
        {rows.map((row, index) => {
          const tint = row.danger ? c.error : c.accent;
          return (
            <Fragment key={row.title}>
              {index > 0 && <View style={styles.divider} />}
              <Tap
                testID={row.testID}
                accessibilityRole="button"
                accessibilityLabel={
                  row.value ? `${row.title}, ${row.value}` : row.title
                }
                accessibilityHint={row.hint}
                onPress={() => go.push(row.route)}
                feedback="highlight"
                style={[
                  styles.row,
                  index === 0 && styles.first,
                  index === rows.length - 1 && styles.last,
                ]}
              >
                <Icon name={row.icon} color={tint} size={22} />
                <View style={styles.rowText}>
                  <T style={[styles.rowTitle, row.danger && { color: c.error }]}>
                    {row.title}
                  </T>
                  {row.value ? <T style={s.meta}>{row.value}</T> : null}
                </View>
                <Icon name="chevron-forward" size={18} color={c.muted} />
              </Tap>
            </Fragment>
          );
        })}
      </View>
    </View>
  );
}

// Long addresses (Apple's private relay ones have no spaces) wrap rather than
// pushing the page sideways on narrow web viewports.
const wrapAnywhere =
  Platform.OS === "web"
    ? ({ wordBreak: "break-word", overflowWrap: "anywhere" } as unknown as TextStyle)
    : null;

// White surfaces sit in the ivory page on a hairline edge, no shadow.
const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  card: {
    marginTop: space.md,
    padding: space.lg,
    gap: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: font.bold,
    fontSize: 20,
    lineHeight: 26,
    color: c.accent,
  },
  cardTitle: { ...type.heading, flex: 1 },
  actions: { gap: space.md },
  profile: { flexDirection: "row", alignItems: "center", gap: space.lg },
  profileText: { flex: 1, gap: 2 },
  name: type.heading,
  email: { ...type.body, color: c.text },
  provider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: space.xs,
  },
  group: { marginTop: space.xxl, gap: space.sm },
  groupTitle: { ...type.kicker, color: c.muted, paddingHorizontal: space.lg },
  // No overflow clipping, so web focus rings on rows stay visible; the first
  // and last rows carry the corner radius instead.
  list: {
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  // One point inside the list's edge, so a pressed row's tint follows it.
  first: {
    borderTopLeftRadius: radius.lg - 1,
    borderTopRightRadius: radius.lg - 1,
  },
  last: {
    borderBottomLeftRadius: radius.lg - 1,
    borderBottomRightRadius: radius.lg - 1,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...type.label, fontSize: 16, lineHeight: 22 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.divider,
    marginStart: 52,
  },
  signOut: { marginTop: space.xxl, gap: space.md },
});
