import { exitTo } from "../navigation";
import { Header, Page, StatePanel } from "../ui";

export default function NotFound() {
  return (
    <Page>
      <Header back />
      <StatePanel
        level={1}
        icon="compass-outline"
        title="Page not found"
        body="The link may be broken or out of date."
        label="Browse sermons"
        action={() => exitTo("/")}
      />
    </Page>
  );
}
