import { PropsWithChildren } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { space } from "../theme";
import {
  Header,
  Notice,
  Page,
  PageTitle,
  SectionHeading,
  T,
  TextButton,
  s,
  web,
} from "../ui";

/**
 * A draft written to match what the app actually does today (see
 * src/auth and supabase/). The Supabase project runs in AWS us-east-1
 * (N. Virginia). Review it, and fill in the contact details, before a public
 * release.
 */
export default function Privacy() {
  return (
    <Page>
      <Header back />
      <PageTitle
        title="Privacy Policy"
        lead="What AAO collects, why, and how to delete it. AAO is a free app for finding and watching public sermons."
      />
      <Notice>Draft for review before public release.</Notice>

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
          ]}
        />
        <P>
          If you sign in with Apple and choose to hide your email, AAO only
          receives the private address Apple creates for it. If you use a
          password, the account service stores it as a one-way hash, never as
          plain text.
        </P>
      </Section>

      <Section title="On your device">
        <P>
          To keep you signed in and remember your choices between visits, the
          app stores your sign-in session (in the iPhone Keychain, Android’s
          secure storage, or your browser’s storage on the web), the topics you
          chose, whether you’ve seen the welcome screens, and which sermons you
          opened from a shared link. Signing out removes the session; the rest
          stays until you change it or remove the app.
        </P>
      </Section>

      <Section title="How it’s used">
        <P>
          Only to run your account: to sign you in, keep your topics, saved
          sermons and place in each sermon on any device, and greet you by
          name. AAO emails you only to
          send codes for signing in, confirming your email or resetting your
          password.
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
          topics or saved sermons.
        </P>
      </Section>

      <Section title="Sensitive information">
        <P>
          The sermons you save and the topics you choose may say something
          about your religious beliefs. AAO uses them only to run your account.
          No one else can see them in the app, and they’re never used for
          advertising or shared.
        </P>
      </Section>

      <Section title="YouTube and sign-in providers">
        <P>
          Sermons play through YouTube’s embedded player, and their artwork
          loads from YouTube’s servers. When the player loads, YouTube (part of
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
          Account information is stored with Supabase, a hosted database
          service that processes it on AAO’s behalf, in the United States
          (Amazon Web Services, N. Virginia). If you use AAO from another
          country, your account information is sent to and stored there.
          Connections between the app and Supabase are encrypted. Like most
          online services, Supabase keeps short-lived technical logs of
          requests, such as IP addresses, for security and troubleshooting.
        </P>
      </Section>

      <Section title="Keeping and deleting it">
        <P>
          Your information is kept while you have an account. You can delete
          your account at any time in Account › Delete account. Your account,
          name, topics, saved sermons and watch progress are removed
          immediately. If database
          backups are turned on, a copy may remain in them for a short time
          until they’re replaced.
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
        {/* PLACEHOLDER: add a contact email before public release. */}
        <P>[Contact details to be added before public release.]</P>
      </Section>

      <T style={[s.meta, { marginTop: space.xxl }]}>
        Draft of 14 October 2026
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
  return <T style={s.body}>{children}</T>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={styles.list} role="list">
      {items.map((item) => (
        <View key={item} style={styles.item} role="listitem">
          {/* Text, so the bullet scales and aligns with the line it marks. */}
          <T
            style={s.body}
            accessibilityElementsHidden
            importantForAccessibility="no"
            {...web({ "aria-hidden": true })}
          >
            •
          </T>
          <T style={[s.body, { flex: 1 }]}>{item}</T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  list: { gap: space.sm },
  item: { flexDirection: "row", gap: space.sm },
});
