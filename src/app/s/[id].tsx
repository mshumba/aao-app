import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { firstParam } from "../../navigation";
import { c } from "../../theme";

/**
 * A shared link, /s/<id>. Whoever opens it may watch that sermon without an
 * account, so the pass is kept before the sermon page opens in its place.
 * An unknown id goes to the sermon page too, which says it isn't available.
 */
export default function SharedLink() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = firstParam(params.id) ?? "";
  const { ready, hasPass, grantPass } = useAccount();
  const catalogue = useCatalogue();
  const known = !!catalogue.find(id);

  useEffect(() => {
    if (ready && known) grantPass(id);
  }, [ready, known, id, grantPass]);

  // A blank page until the pass is in place, so the sermon page never
  // opens asking a guest to sign in for a sermon they were sent. A sermon
  // newer than the device's copy of the library arrives with the sync.
  if (!ready || (!known && !catalogue.settled) || (known && !hasPass(id)))
    return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!id) return <Redirect href="/" />;
  return <Redirect href={{ pathname: "/sermon/[id]", params: { id } }} />;
}
