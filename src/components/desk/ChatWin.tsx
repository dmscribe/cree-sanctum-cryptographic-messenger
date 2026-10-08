import { useEffect } from "react";
import { ChatThread } from "../ChatThread";
import { armGhostPing, flushGhostPings } from "@/lib/server/ghosts";
import { useDesk } from "@/lib/desk/store";

function armPing(ghostId: string) {
  void armGhostPing({ data: { ghostId } })
    .then((r) => {
      if (!r?.armed || !r.delayMs) return;
      window.setTimeout(() => {
        void flushGhostPings()
          .then((n) => {
            if (n && n.delivered > 0) useDesk.getState().bumpPeople();
          })
          .catch(() => {});
      }, r.delayMs + 500);
    })
    .catch(() => {});
}

export function ChatWin({ peerId }: { peerId: string }) {
  useEffect(() => {
    if (!peerId.startsWith("ghost-")) return;
    return useDesk.subscribe((state, prev) => {
      const now = state.windows.find((w) => w.kind === "chat" && w.peerId === peerId);
      const before = prev.windows.find((w) => w.kind === "chat" && w.peerId === peerId);
      if (!before) return;
      const closed = !now;
      const minimized = Boolean(now && !before.minimized && now.minimized);
      if (closed || minimized) armPing(peerId);
    });
  }, [peerId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatThread peerId={peerId} embedded />
    </div>
  );
}
