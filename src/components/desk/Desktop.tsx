import { useEffect } from "react";
import { useSanctum } from "../SanctumProvider";
import { useDesk, loadStoredScale, isPhoneViewport } from "@/lib/desk/store";
import { Win } from "./Win";
import { Taskbar } from "./Taskbar";
import { DeskReset } from "./DeskReset";
import { ContactsSeat } from "./ContactsSeat";
import { ChatWin } from "./ChatWin";
import { CardWin } from "./CardWin";
import { MoodsWin } from "./MoodsWin";
import { DiscoverWin } from "./DiscoverWin";
import { ViewsWin } from "./ViewsWin";
import { IdentityWin } from "./IdentityWin";
import { AboutWin } from "./AboutWin";
import { NodeLogWin } from "./NodeLogWin";
import { LogoMark } from "../LogoMark";
import { FirstRun } from "../FirstRun";
import { RoomsWin } from "./RoomsWin";
import { DeskNudge } from "./DeskNudge";

export function Desktop() {
  const { ready, firstRun } = useSanctum();
  const { windows, open, ensureContacts, close, clampAll, setScale } = useDesk();

  useEffect(() => {
    setScale(loadStoredScale());
  }, [setScale]);

  useEffect(() => {
    if (!ready) return;
    if (firstRun) {
      open({
        id: "firstrun",
        kind: "firstrun",
        title: "Before you speak",
        x: 36,
        y: 16,
        w: 460,
        h: 500,
        maximized: isPhoneViewport(),
      });
      return;
    }
    close("firstrun");
    ensureContacts();
  }, [ready, firstRun, open, ensureContacts, close]);

  useEffect(() => {
    const onResize = () => clampAll();
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [clampAll]);

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-desk text-ink">
        <div className="flex flex-col items-center gap-4">
          <LogoMark className="h-20 w-20" />
          <p>Opening the desk…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="desk-viewport">
      <DeskReset />
      <div className="desk-stage">
        <div className="desk-root text-ink">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "linear-gradient(180deg, #d7eeea 0%, #cfe8e4 55%, #eef6f4 100%)",
            }}
          />
          {windows.map((w) => (
            <Win key={w.id} win={w} noClose={w.kind === "firstrun" || w.kind === "contacts"} noMin={w.kind === "firstrun"}>
              {w.kind === "contacts" && <ContactsSeat />}
              {w.kind === "rooms" && <RoomsWin />}
              {w.kind === "chat" && w.peerId && <ChatWin peerId={w.peerId} />}
              {w.kind === "card" && w.peerId && <CardWin peerId={w.peerId} />}
              {w.kind === "moods" && <MoodsWin />}
              {w.kind === "discover" && <DiscoverWin />}
              {w.kind === "views" && <ViewsWin />}
              {w.kind === "identity" && <IdentityWin />}
              {w.kind === "about" && <AboutWin />}
              {w.kind === "nodelog" && <NodeLogWin />}
              {w.kind === "firstrun" && (
                <div className="p-4">
                  <FirstRun />
                </div>
              )}
            </Win>
          ))}
        </div>
      </div>
      <DeskNudge />
      <Taskbar />
    </div>
  );
}
