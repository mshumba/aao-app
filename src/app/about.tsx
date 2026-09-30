import { Header, Page, SectionHeading, T, s } from "../ui";
export default function About() {
  return (
    <Page>
      <Header title="About" back />
      <T style={s.title}>The Viewing Room.</T>
      <T style={[s.body, { marginTop: 20 }]}>
        A place to browse, find and watch public messages by Apostle Arome
        Osayi.
      </T>
      <SectionHeading>About this prototype</SectionHeading>
      <T style={s.body}>
        This internal design and playback prototype follows the selected dark
        direction. The four messages use titles and thumbnails verified against
        public ministry links and YouTube on 30 September 2026. The catalogue is
        provisional and isn’t a complete ministry archive.
      </T>
      <SectionHeading>Topics for exploration</SectionHeading>
      <T style={s.body}>
        Topic labels and tags are demo assignments, not a review of message
        content. They show how a future library could organize messages for
        spiritual growth.
      </T>
      <SectionHeading>Guest, always</SectionHeading>
      <T style={s.body}>
        Watching never requires an account. Account screens only demonstrate the
        flow: they create no account and send no reset email. Demo state
        disappears on reload.
      </T>
      <SectionHeading>Playback & content</SectionHeading>
      <T style={s.body}>
        YouTube is the provisional player. Its controls, branding, advertising
        and availability belong to the provider. Content belongs to its
        respective owners; no ministry endorsement is implied.
      </T>
      <T style={[s.small, { marginTop: 32 }]}>
        Version 0.1.0 · Expo SDK 57{"\n"}No downloads, background audio or
        account sync.
      </T>
    </Page>
  );
}
