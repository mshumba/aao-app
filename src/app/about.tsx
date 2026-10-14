import { sermons } from "../data/sermons";
import { space } from "../theme";
import { sermonCount } from "../topics";
import { Header, Page, PageTitle, SectionHeading, T, s } from "../ui";

export default function About() {
  return (
    <Page>
      <Header back />
      <PageTitle
        title="About this preview"
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
      <SectionHeading>Watching as a guest</SectionHeading>
      <T style={s.body}>
        You never need an account to browse, search or watch. Accounts aren’t
        live yet: the account screens are a demo that creates no account and
        sends no email, and a demo sign-in ends when you reload.
      </T>
      <SectionHeading>Playback and content</SectionHeading>
      <T style={s.body}>
        Videos play through YouTube for now. YouTube controls the player, its
        branding, any advertising and whether a video is available. Sermons
        belong to their respective owners, and this preview isn’t endorsed by
        the ministry.
      </T>
      <T style={[s.meta, { marginTop: space.xxl }]}>
        Version 0.1.0 · Preview{"\n"}No downloads or background audio.
      </T>
    </Page>
  );
}
