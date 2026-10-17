import { Platform, Share } from "react-native";
import { webUrl } from "./auth/config";
import { headline } from "./data/display";
import type { Sermon } from "./data/sermons";
import type { IconName } from "./ui";

type ShowToast = (message: string, icon?: IconName) => void;

/**
 * The public link for a sermon. It opens /s/<id>, which lets a guest watch
 * that sermon without an account before showing its page.
 */
export function shareUrl(sermonId: string) {
  return `${webUrl}/s/${encodeURIComponent(sermonId)}`;
}

const aborted = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

/**
 * Shares a sermon's link through the system share sheet. Browsers without
 * one (or that refuse) copy the link instead and say so. Never throws:
 * closing the sheet isn't a failure.
 */
export async function shareSermon(sermon: Sermon, toast: ShowToast) {
  const url = shareUrl(sermon.id);
  const title = headline(sermon);
  try {
    if (Platform.OS !== "web") {
      // iOS shares the url as a link of its own, so the text stays the title
      // (otherwise Messages shows the link twice). Android only sends text.
      await Share.share(
        Platform.OS === "ios"
          ? { message: title, url }
          : { title, message: `${title} — ${url}` },
        { dialogTitle: "Share sermon", subject: title },
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
    toast("Couldn’t share this sermon. Try again.", "alert-circle-outline");
  }
}
