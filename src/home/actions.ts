import * as Haptics from "expo-haptics";
import { router, type Href } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { useAccount, useSaved } from "../auth/AccountProvider";
import { useGate } from "../auth/gate";
import { requestWatch, useGo } from "../navigation";
import { loadedSermonId } from "../player/PlayerProvider";
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
 *   left off; `at` asks the page to start there instead (`t`, in seconds).
 * - toggleSave: saves or unsaves (asks a guest for an account first).
 */
export function useSermonActions() {
  const go = useGo();
  const gate = useGate();
  const saved = useSaved();
  const userId = useAccount().user?.id ?? null;
  const toast = useToast();
  const latest = useRef({ go, gate, saved, toast, userId });
  useLayoutEffect(() => {
    latest.current = { go, gate, saved, toast, userId };
  });
  // Keep pending writes across account changes; only the same account and sermon wait.
  const saving = useRef(new Set<string>());

  const open = useCallback((id: string) => {
    latest.current.go.push({ pathname: "/sermon/[id]", params: { id } });
  }, []);

  const watch = useCallback((id: string, at?: number) => {
    const { gate, go } = latest.current;
    if (!gate.require({ kind: "watch", sermonId: id })) return;
    go.run(() => {
      // Already loaded (docked): just open it where it is, unless a place
      // was asked for.
      if (loadedSermonId() !== id || at != null) requestWatch(id);
      router.push({
        pathname: "/sermon/[id]",
        params: at != null ? { id, t: String(Math.max(0, Math.floor(at))) } : { id },
      });
    });
  }, []);

  const toggleSave = useCallback(async (id: string) => {
    const { gate, saved, toast, userId } = latest.current;
    const key = JSON.stringify([userId, id]);
    if (saving.current.has(key)) return;
    if (!gate.require({ kind: "save", sermonId: id })) return;
    saving.current.add(key);
    const next = !saved.isSaved(id);
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await saved.setSaved(id, next);
      if (latest.current.userId !== userId) return;
      toast(next ? "Saved" : "Removed from saved", next ? "bookmark" : "bookmark-outline");
    } catch {
      if (latest.current.userId !== userId) return;
      toast(
        next ? "Couldn’t save. Check your connection." : "Couldn’t remove it. Check your connection.",
        "alert-circle-outline",
      );
    } finally {
      saving.current.delete(key);
    }
  }, []);

  return useMemo(() => ({ open, watch, toggleSave }), [open, watch, toggleSave]);
}
