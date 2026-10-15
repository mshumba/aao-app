import * as Haptics from "expo-haptics";
import { router, type Href } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import { useGate } from "../auth/gate";
import { requestWatch, useGo } from "../navigation";
import { usePlayerSession } from "../player/PlayerProvider";
import { useToast } from "../toast";

/**
 * A path's page. The route is registered in the root stack; until its file
 * exists, typed routes don't list it, so the href is built by hand here.
 */
export function pathHref(id: string) {
  return { pathname: "/path/[id]", params: { id } } as unknown as Href;
}

/**
 * What Home's controls do with a sermon, with stable identities so the
 * memoised cards and rails below don't re-render on every account change.
 *
 * - open: the sermon's page.
 * - watch: the sermon's page, playing (asks a guest for a free account
 *   first, as Watch does everywhere). A signed-in viewer resumes where they
 *   left off; `at` asks the page to start there instead (`t`, in seconds),
 *   for a path day's focus.
 * - toggleSave: saves or unsaves (asks a guest for an account first).
 */
export function useSermonActions() {
  const go = useGo();
  const gate = useGate();
  const account = useAccount();
  const toast = useToast();
  const session = usePlayerSession();
  const latest = useRef({ go, gate, account, toast, playing: session.sermon?.id });
  useLayoutEffect(() => {
    latest.current = { go, gate, account, toast, playing: session.sermon?.id };
  });
  const saving = useRef(false);

  const open = useCallback((id: string) => {
    latest.current.go.push({ pathname: "/sermon/[id]", params: { id } });
  }, []);

  const watch = useCallback((id: string, at?: number) => {
    const { gate, go, playing } = latest.current;
    if (!gate.require({ kind: "watch", sermonId: id })) return;
    go.run(() => {
      // Already loaded (docked): just open it where it is, unless a place
      // was asked for.
      if (playing !== id || at != null) requestWatch(id);
      router.push({
        pathname: "/sermon/[id]",
        params: at != null ? { id, t: String(Math.max(0, Math.floor(at))) } : { id },
      });
    });
  }, []);

  const toggleSave = useCallback(async (id: string) => {
    const { gate, account, toast } = latest.current;
    if (saving.current) return;
    if (!gate.require({ kind: "save", sermonId: id })) return;
    saving.current = true;
    const next = !account.isSaved(id);
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await account.setSaved(id, next);
      toast(next ? "Saved to your library" : "Removed from saved", next ? "bookmark" : "bookmark-outline");
    } catch {
      toast(
        next ? "Couldn’t save. Check your connection." : "Couldn’t remove it. Check your connection.",
        "alert-circle-outline",
      );
    } finally {
      saving.current = false;
    }
  }, []);

  return useMemo(() => ({ open, watch, toggleSave }), [open, watch, toggleSave]);
}
