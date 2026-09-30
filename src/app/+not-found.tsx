import { router } from "expo-router";
import { Header, Page, StatePanel } from "../ui";
export default function NotFound() {
  return (
    <Page>
      <Header title="Page not found" back />
      <StatePanel
        title="Let’s find your way back."
        body="This page isn’t in the prototype. The sermon library is a good place to start."
        label="Browse sermons"
        action={() => router.replace("/")}
      />
    </Page>
  );
}
