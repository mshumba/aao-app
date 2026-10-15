import { PropsWithChildren } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { space, type } from "../theme";
import {
  Header,
  Notice,
  Page,
  PageTitle,
  SectionHeading,
  T,
  TextButton,
  c,
  s,
} from "../ui";

/**
 * A plain-language draft. Review it, and add contact details, before a
 * public release.
 */
export default function Terms() {
  return (
    <Page>
      <Header back />
      <PageTitle
        kicker="Using AAO"
        title="Terms of Use"
        lead="The rules for using AAO. By creating an account, you agree to them."
      />
      <Notice>Draft for review before public release.</Notice>

      <Section title="Free to use">
        <P>
          AAO is free. Browsing is open to everyone, and some features, such as
          saving sermons, need a free account.
        </P>
      </Section>

      <Section title="Your account">
        <P>
          Your account is for you alone. Use an email address you can access,
          keep your sign-in details to yourself, and get in touch if you think
          someone else has used your account.
        </P>
      </Section>

      <Section title="Acceptable use">
        <P>
          Don’t use AAO for anything unlawful. Don’t try to break or overload
          it, get around its limits, reach other people’s accounts or
          information, or copy its catalogue in bulk.
        </P>
      </Section>

      <Section title="Sermons and other content">
        <P>
          Sermons belong to their owners. AAO doesn’t host them: they play
          through YouTube’s player, and YouTube’s Terms of Service apply when
          you watch. A sermon may stop being available if its owner or YouTube
          removes it.
        </P>
        <P>
          Titles, dates and artwork come from public sources. The topics
          sermons appear under are AAO’s own sample labels.
        </P>
        <TextButton
          label="YouTube Terms of Service"
          icon="open-outline"
          align="start"
          hint="Opens in your browser"
          onPress={() => Linking.openURL("https://www.youtube.com/t/terms")}
        />
      </Section>

      <Section title="No guarantees">
        <P>
          AAO is provided as it is. It may change, pause or stop, and it may
          not always be available or free of errors. As far as the law allows,
          AAO isn’t responsible for losses that come from using it. Nothing in
          these terms takes away rights you have by law.
        </P>
      </Section>

      <Section title="Ending your account">
        <P>
          You can delete your account at any time in Account › Delete account.
          An account used in ways these terms don’t allow may be suspended or
          closed.
        </P>
      </Section>

      <Section title="Changes">
        <P>
          If these terms change, the new version will appear here with its
          date. Significant changes will be shown in the app before they apply.
          Using AAO after that means you accept them.
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
  return <T style={styles.body}>{children}</T>;
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  // Running text to read, so in the text colour rather than muted.
  body: { ...type.body, color: c.text },
});
