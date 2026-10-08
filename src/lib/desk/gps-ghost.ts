import { nearestNetworkGhost } from "@/lib/ghosts/catalog";
import { requestNearestGhost } from "@/lib/server/ghosts";
import { playNudgeChime } from "./chime";
import { useDesk } from "./store";

const KEY = "sanctum-last-ghost";

export const GHOST_SEES_YOU =
  "A ghost will befriend you now that it sees you. Accept the friend request to connect to that network and find friends.";

export function rememberGhostId(id: string) {
  try {
    window.sessionStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
}

export function lastGhostId(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** GPS (or last fix) asks the nearest regional ghost — never Ryder or Charlie — to send a request. */
export async function pingNearestGhost(opts: {
  lat?: number;
  lon?: number;
  announce: boolean;
}): Promise<boolean> {
  let id: string | null = null;
  if (typeof opts.lat === "number" && typeof opts.lon === "number") {
    id = nearestNetworkGhost(opts.lat, opts.lon)?.id ?? null;
    if (id) rememberGhostId(id);
  } else {
    id = lastGhostId();
  }
  if (!id) return false;
  try {
    const r = await requestNearestGhost({ data: { ghostId: id } });
    if (r.ok && opts.announce) {
      useDesk.getState().showNudge({
        title: "Cree Sanctum",
        body: GHOST_SEES_YOU,
      });
      playNudgeChime();
    }
    return Boolean(r.ok);
  } catch {
    return false;
  }
}
