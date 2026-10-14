import { Badge, Header, Page, PageTitle, SectionHeading, T, s } from "../ui";

export default function Privacy() {
  return (
    <Page>
      <Header back />
      <PageTitle
        title="Privacy"
        lead="What this preview and YouTube can see. This is a draft and will be reviewed before any public release."
      >
        <Badge>Draft</Badge>
      </PageTitle>
      <SectionHeading>Demo accounts</SectionHeading>
      <T style={s.body}>
        Accounts aren’t live yet. What you type on the account screens stays on
        that screen and isn’t sent, logged or saved by the app. Please use the
        sample details rather than a real password. Leaving a form clears it,
        and reloading ends a demo sign-in.
      </T>
      <SectionHeading>YouTube</SectionHeading>
      <T style={s.body}>
        Sermon thumbnails load from YouTube’s image servers when shown. Pressing
        Watch sermon loads the YouTube player, which may set cookies or collect device
        and usage data under Google’s policies. This happens whether or not you
        use the demo account screens.
      </T>
      <SectionHeading>What’s connected</SectionHeading>
      <T style={s.body}>
        The app itself has no analytics, real account service or cloud database
        connected.
      </T>
    </Page>
  );
}
