import { useExitTo } from "../navigation";
import { Header, Page, StatePanel } from "../ui";

export default function NotFound() {
  const exitTo = useExitTo();
  return (
    <Page header={<Header back />}>
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
