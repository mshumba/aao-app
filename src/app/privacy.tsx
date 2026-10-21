import { PropsWithChildren } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { space, type } from "../theme";
import {
  Header,
  Page,
  PageTitle,
  SectionHeading,
  T,
  TextButton,
  c,
  s,
  web,
} from "../ui";

/**
 * A draft written to match what the app actually does today (see src/auth,
 * src/learning, src/player/media.ts and supabase/, including the search
 * function in supabase/functions/search). The Supabase project runs in AWS us-east-1
 * (N. Virginia). Review it, and fill in the contact details, before a public
 * release.
 */
export default function Privacy() {
  return (
    <Page header={<Header back />}>
      <PageTitle
        kicker="Your information"
        title="Privacy Policy"
        lead="What AAO collects, why, and how to delete it. AAO is a free app for finding and watching public sermons."
      />

      <Section title="What AAO collects">
        <P>
          You can browse without an account; AAO stores nothing about you in
          its account service while you do. If you create a free account, it
          keeps:
        </P>
        <Bullets
          items={[
            "Your email address.",
            "Your first name, if you add one.",
            "How you sign in: Apple, Google or email.",
            "The topics you choose.",
            "The sermons you save.",
            "Where you stopped in each sermon you watch, so it can pick up there.",
            "Your progress through guided paths: the paths you start, and the days you finish.",
          ]}
        />
        <P>
          If you sign in with Apple and choose to hide your email, AAO only
          receives the private address Apple creates for it. If you use a
          password, the account service stores it as a one-way hash, never as
          plain text.
        </P>
      </Section>

      <Section title="When you search">
        <P>
          When you type what you’re going through into Search, the words you
          type are sent to OpenAI, an AI service, so it can understand what
          you mean and find the moments in sermons that speak to it. They are
          sent without your name, email address or account.
        </P>
        <P>
          So the same question is answered faster next time, AAO keeps the
          answer for up to 24 hours. It’s kept under a scrambled code made
          from the question, not the words themselves, and it isn’t linked to
          you or your account. After 24 hours it’s deleted.
        </P>
        <P>
          To stop the service being overloaded, AAO counts how many searches
          come from each signed-in account, or from each internet address
          (scrambled) for guests, over the last few minutes and hour. That
          count isn’t linked to what you searched for.
        </P>
        <P>
          Your recent searches are kept on this device only, so you can run
          them again. You can remove them in Search at any time.
        </P>
        <TextButton
          label="OpenAI Privacy Policy"
          icon="open-outline"
          align="start"
          hint="Opens in your browser"
          onPress={() => Linking.openURL("https://openai.com/policies/privacy-policy")}
        />
      </Section>

      <Section title="On your device">
        <P>
          To keep you signed in and remember your choices between visits, the
          app stores your sign-in session (in the iPhone Keychain, Android’s
          secure storage, or your browser’s storage on the web), the topics you
          chose, your recent searches, whether you’ve seen the welcome
          screens, which blessings you’ve already seen, and which
          sermons you opened from a shared link. While you’re signed in, it
          also keeps a copy of your place in each sermon, so it can show it
          without a connection. Signing out removes the session and that
          copy. A place you reached without a connection that hasn’t been
          saved to your account yet stays on the device until you sign in
          here again, when it’s saved. The rest stays until you change it or
          remove the app.
        </P>
      </Section>

      <Section title="How it’s used">
        <P>
          Only to run your account and the app: to sign you in, keep your
          topics, saved sermons, place in each sermon and progress through
          paths on any device, find sermons for what you search, and greet
          you by name. AAO emails you only to send codes for signing in,
          confirming your email or resetting your password.
        </P>
      </Section>

      <Section title="What AAO doesn’t do">
        <Bullets
          items={[
            "No ads.",
            "No selling or sharing your information with advertisers or data brokers.",
            "No tracking you across other apps or websites.",
            "No analytics. If that changes, this policy will say so before it does.",
          ]}
        />
      </Section>

      <Section title="Crash reports">
        <P>
          When the app crashes or hits an error, it sends a report to Sentry,
          a crash-reporting service, so the problem can be fixed. A report
          holds the error, the device model, its operating system and the app
          version. It never includes your name, email address, IP address,
          topics, searches or saved sermons.
        </P>
      </Section>

      <Section title="Sensitive information">
        <P>
          The sermons you save, the topics and paths you choose and what you
          type into Search may say something about your religious beliefs or
          what you’re going through. AAO uses them only to run your account
          and answer your search. No one else can see them in the app, and
          they’re never used for advertising or shared beyond the services
          named here.
        </P>
      </Section>

      <Section title="Sermon videos">
        <P>
          On iPhone and Android, sermons play from AAO’s own copies, stored
          with Cloudflare, a hosting and network service, at
          audio.aaolearning.com. When you open a sermon the app asks there
          whether it has a copy, and while you watch it streams the video from
          there, so Cloudflare sees your device’s IP address and which videos
          it asks for. No account details are sent with them.
        </P>
      </Section>

      <Section title="YouTube and sign-in providers">
        <P>
          On the web, and for sermons still being added, the video plays
          through YouTube’s embedded player. Sermon artwork loads from
          YouTube’s servers. When YouTube’s player loads, YouTube (part of
          Google) may set cookies and collect device and usage information
          under Google’s own terms and privacy policy.
        </P>
        <P>
          If you sign in with Apple or Google, they confirm it’s you and share
          your email address with AAO, and may share your name. Their own
          privacy policies cover that sign-in.
        </P>
        <TextButton
          label="Google Privacy Policy"
          icon="open-outline"
          align="start"
          hint="Opens in your browser"
          onPress={() => Linking.openURL("https://policies.google.com/privacy")}
        />
      </Section>

      <Section title="Where it’s stored">
        <P>
          Account information, and the search answers kept for 24 hours, are
          stored with Supabase, a hosted database service that processes them
          on AAO’s behalf, in the United States (Amazon Web Services, N.
          Virginia). If you use AAO from another country, your information is
          sent to and stored there. Connections between the app, Supabase,
          OpenAI and Cloudflare are encrypted. Like most online services,
          Supabase keeps short-lived technical logs of requests, such as IP
          addresses, for security and troubleshooting.
        </P>
      </Section>

      <Section title="Keeping and deleting it">
        <P>
          Your information is kept while you have an account. You can delete
          your account at any time in Account › Delete account. Your account,
          name, topics, saved sermons, watch progress and path progress are
          removed immediately. If database backups are turned on, a copy may
          remain in them for a short time until they’re replaced.
        </P>
        <P>
          You can change your name and topics in Account at any time. Depending
          on where you live, you may have other rights, such as asking for a
          copy of your information.
        </P>
      </Section>

      <Section title="Children">
        <P>
          AAO isn’t directed to children under 13 and doesn’t knowingly collect
          their information. If you think a child has created an account,
          get in touch and it will be deleted.
        </P>
      </Section>

      <Section title="Changes">
        <P>
          If this policy changes, the new version will appear here with its
          date. Significant changes will be shown in the app before they apply.
        </P>
      </Section>

      <Section title="Contact">
        <P>Email support@aaolearning.com.</P>
      </Section>

      <T style={[s.meta, { marginTop: space.xxl }]}>
        Last updated 20 October 2026
      </T>
    </Page>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <>
      <SectionHeading>{title}</SectionHeading>
      <View style={styles.section}>{children}</View>
    </>
  );
}

function P({ children }: PropsWithChildren) {
  return <T style={styles.body}>{children}</T>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={styles.list} role="list">
      {items.map((item) => (
        <View key={item} style={styles.item} role="listitem">
          {/* Text, so the bullet scales and aligns with the line it marks. */}
          <T
            style={styles.bullet}
            accessibilityElementsHidden
            importantForAccessibility="no"
            {...web({ "aria-hidden": true })}
          >
            •
          </T>
          <T style={[styles.body, { flex: 1 }]}>{item}</T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  // Running text to read, so in the text colour rather than muted.
  body: { ...type.body, color: c.text },
  bullet: { ...type.body, color: c.gold },
  list: { gap: space.sm },
  item: { flexDirection: "row", gap: space.sm },
});
