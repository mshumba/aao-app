import { Badge, Header, Page, SectionHeading, T, s } from "../ui";
export default function Privacy() {
  return (
    <Page>
      <Header title="Privacy" back />
      <Badge>DRAFT · PROTOTYPE ONLY</Badge>
      <T style={[s.title, { marginTop: 22 }]}>
        A clear view of{"\n"}your data.
      </T>
      <SectionHeading>Demo accounts</SectionHeading>
      <T style={s.body}>
        The account forms run entirely in memory. Nothing entered is sent,
        logged or saved by the app. Use the provided demo values rather than
        real credentials. Closing a form clears its fields; reloading resets the
        demo session.
      </T>
      <SectionHeading>Public media</SectionHeading>
      <T style={s.body}>
        Sermon thumbnails load from YouTube’s image servers when shown. Tapping
        Play loads the YouTube player, which may set cookies or collect device
        and usage data under Google’s policies. This traffic is separate from
        the simulated account forms.
      </T>
      <SectionHeading>This build</SectionHeading>
      <T style={s.body}>
        No app analytics, account service or cloud database is connected. This
        draft describes the prototype, and needs review before any public
        release.
      </T>
    </Page>
  );
}
