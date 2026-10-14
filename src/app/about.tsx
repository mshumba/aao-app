import Constants from "expo-constants";
import { useAccount } from "../auth/AccountProvider";
import { sermons } from "../data/sermons";
import { space } from "../theme";
import { sermonCount } from "../topics";
import { Header, Page, PageTitle, SectionHeading, T, s } from "../ui";

const version = Constants.expoConfig?.version;

export default function About() {
  const account = useAccount();
  return (
    <Page>
      <Header back />
      <PageTitle
        title="About AAO"
        lead="A place to find and watch public sermons by Apostle Arome Osayi, organised by how they build you up."
      />
      <SectionHeading>What’s here</SectionHeading>
      <T style={s.body}>
        {sermonCount(sermons.length)} from public sources. Their titles, dates
        and artwork were checked against public ministry links and YouTube on
        30 September 2026. It’s a small sample, not the full archive.
      </T>
      <SectionHeading>Topics</SectionHeading>
      <T style={s.body}>
        Spiritual Growth, Prayer, Faith and Christian Living show how sermons
        could be organised by how they edify. The topics each sermon appears
        under are sample assignments; nobody has checked them against the
        sermons yet.
      </T>
      <SectionHeading>Accounts</SectionHeading>
      <T style={s.body}>{accountsText(account.mode, account.guestWatch)}</T>
      <SectionHeading>Playback and content</SectionHeading>
      <T style={s.body}>
        Videos play through YouTube for now. YouTube controls the player, its
        branding, any advertising and whether a video is available.
      </T>
      <T style={[s.meta, { marginTop: space.xxl }]}>
        {version ? `Version ${version}\n` : ""}No downloads or background
        audio.
      </T>
    </Page>
  );
}

/** What an account adds, following the live guest-watch setting. */
function accountsText(
  mode: ReturnType<typeof useAccount>["mode"],
  guestWatch: ReturnType<typeof useAccount>["guestWatch"],
) {
  if (mode === "unavailable")
    return "Browsing and watching are open to everyone. Accounts are coming soon.";
  if (guestWatch === "all")
    return "Browsing and watching are open to everyone. A free account lets you save sermons and keep your topics on any device.";
  const shared =
    guestWatch === "shared"
      ? " Sermons someone shares with you by link play without an account."
      : "";
  return `Browsing is open to everyone. A free account lets you watch sermons, save them and keep your topics on any device.${shared}`;
}
