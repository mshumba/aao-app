import { Platform, Share } from "react-native";
import { webUrl } from "../auth/config";
import type { IconName } from "../ui";

type ShowToast = (message: string, icon?: IconName) => void;

/** The public link to a path's page (/path/<id>), which anyone can open. */
export function pathUrl(pathId: string) {
  return `${webUrl}/path/${encodeURIComponent(pathId)}`;
}

const aborted = (error: unknown) => error instanceof Error && error.name === "AbortError";

/**
 * Shares a path's name and link through the system share sheet, as
 * shareSermon (src/share.ts) does for a sermon: browsers without one copy
 * the link and say so. Never throws; closing the sheet isn't a failure.
 */
export async function sharePath(path: { id: string; name: string }, toast: ShowToast) {
  const url = pathUrl(path.id);
  const title = path.name;
  try {
    if (Platform.OS !== "web") {
      await Share.share(
        Platform.OS === "ios" ? { message: title, url } : { title, message: `${title} — ${url}` },
        { dialogTitle: "Share path", subject: title },
      );
      return;
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (aborted(error)) return;
        // Blocked or unsupported here: copy the link instead.
      }
    }
    await navigator.clipboard.writeText(url);
    toast("Link copied", "link-outline");
  } catch {
    toast("Couldn’t share this path. Try again.", "alert-circle-outline");
  }
}
