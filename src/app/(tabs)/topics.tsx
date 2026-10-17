import { Redirect } from "expo-router";

/**
 * Topics is no longer a tab (Home · Paths · Search · Account). Old links to
 * /topics go to Search, where topics are browsed; each topic's own page
 * (/topics/[topicId]) is unchanged.
 */
export default function TopicsRedirect() {
  return <Redirect href="/search" />;
}
