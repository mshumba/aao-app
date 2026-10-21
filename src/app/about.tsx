import Constants from "expo-constants";
import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import { catalogueMode, useCatalogue } from "../catalogue/CatalogueProvider";
import { space, type } from "../theme";
import { sermonCount } from "../topics";
import { Header, Page, PageTitle, SectionHeading, T, c, s } from "../ui";

const version = Constants.expoConfig?.version;

export default function About() {
  const account = useAccount();
  const { sermons } = useCatalogue();
  return (
    <Page>
      <Header back />
      <PageTitle
        kicker="About"
        title="About AAO"
        lead="A place to find what speaks to what you’re going through in the teaching of Apostle Arome Osayi, and to grow through guided paths."
      />
      <Section title="What’s here">
        {catalogueMode === "remote" ? (
          <P>
            {sermonCount(sermons.length)} from the Apostle Arome Osayi YouTube
            channel, including messages by other ministers shared there. New
            sermons appear here as they’re added to the channel. Titles, dates
            and artwork come from YouTube; each sermon’s short headline is read
            from its title, and the exact title is always shown with it.
          </P>
        ) : (
          <P>
            {sermonCount(sermons.length)} from public sources. Their titles,
            dates and artwork were checked against public ministry links and
            YouTube on 30 September 2026. It’s a small sample, not the full
            archive.
          </P>
        )}
      </Section>
      <Section title="Search by what you need">
        <P>
          Say what you’re going through in your own words and Search finds the
          moments in sermons that speak to it, with the time to play from. An
          AI service helps it understand the question; the words shown are the
          Apostle’s own, from the sermon.
        </P>
      </Section>
      <Section title="Guided paths">
        <P>
          A path is one message a day on one need, in an order that builds
          from one day to the next.
        </P>
      </Section>
      <Section title="Topics">
        <P>
          Spiritual Growth, Prayer, Faith and Christian Living group sermons
          by how they edify. The topics each sermon appears under are sample
          assignments; nobody has checked them against the sermons yet.
        </P>
      </Section>
      <Section title="Accounts">
        <P>{accountsText(account.mode, account.guestWatch)}</P>
      </Section>
      <Section title="Playback and content">
        <P>
          On iPhone and Android, sermons play in AAO’s own player, and the
          sound carries on when you leave the app or lock your phone.
        </P>
        <P>
          On the web, and for sermons still being added, videos play through
          YouTube. YouTube controls that player, its branding, any advertising
          and whether a video is available.
        </P>
      </Section>
      <T style={[s.meta, { marginTop: space.xxl }]}>
        {version ? `Version ${version}\n` : ""}No downloads.
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

/** What an account adds, following the live guest-watch setting. */
function accountsText(
  mode: ReturnType<typeof useAccount>["mode"],
  guestWatch: ReturnType<typeof useAccount>["guestWatch"],
) {
  if (mode === "unavailable")
    return "Browsing and watching are open to everyone. Accounts are coming soon.";
  if (guestWatch === "all")
    return "Browsing and watching are open to everyone. A free account lets you save sermons, keep your place in paths and keep your topics on any device.";
  const shared =
    guestWatch === "shared"
      ? " Sermons someone shares with you by link play without an account."
      : "";
  return `Browsing is open to everyone. A free account lets you watch sermons, save them, follow guided paths and keep your topics on any device.${shared}`;
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  body: { ...type.body, color: c.text },
});
