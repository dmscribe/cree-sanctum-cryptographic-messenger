import { LayoutGrid, MapPin, Mic, MicOff, Minus, Plus, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { signOut, authEnabled } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useDesk, type WinKind, DESK_SCALES, resolutionLabel } from "@/lib/desk/store";
import { useSanctum } from "../SanctumProvider";
import { LogoMark } from "../LogoMark";
import { cn } from "@/lib/utils";
import { seatLabel } from "@/lib/desk/identity";
import { setGps } from "@/lib/server/profile";
import { pingNearestGhost } from "@/lib/desk/gps-ghost";
import { readDevicePosition, regionFromCoords } from "@/lib/geo/reverse";
import { Button } from "../ui/button";
import {
  audioOutEnabled,
  setAudioOutEnabled,
  micEnabled,
  setMicEnabled,
} from "@/lib/desk/chime";

const APPS: { kind: WinKind; id: string; title: string; stealthOk?: boolean }[] = [
  { kind: "contacts", id: "contacts", title: "Contacts" },
  { kind: "rooms", id: "rooms", title: "Network", stealthOk: true },
  { kind: "moods", id: "moods", title: "Moods" },
  { kind: "discover", id: "discover", title: "Discover", stealthOk: false },
  { kind: "views", id: "views", title: "Views", stealthOk: false },
  { kind: "identity", id: "identity", title: "Identity" },
  { kind: "about", id: "about", title: "About" },
];

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

export function Taskbar() {
  const {
    windows,
    open,
    focus,
    toggleMin,
    ensureContacts,
    tidyDesk,
    clampAll,
    scale,
    nudgeResolution,
  } = useDesk();
  const { stealth, profile, patchProfile } = useSanctum();
  const user = useCurrentUser();
  const [now, setNow] = useState(() => new Date());
  const [menu, setMenu] = useState(false);
  const [gpsAsk, setGpsAsk] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [resText, setResText] = useState("1280×800");
  const barRef = useRef<HTMLDivElement>(null);
  const focused = windows
    .filter((w) => !w.minimized)
    .slice()
    .sort((a, b) => b.z - a.z)[0];
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );

  const gpsOn = Boolean(profile?.gps_consent);
  const gpsLine = gpsOn ? profile?.location_text || "" : "";
  const label = seatLabel(profile?.display_name);
  const scaleIdx = DESK_SCALES.findIndex((s) => s === scale);
  const canLower = scaleIdx < 0 || scaleIdx < DESK_SCALES.length - 1;
  const canRaise = scaleIdx < 0 || scaleIdx > 0;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setAudioOn(audioOutEnabled());
    setMicOn(micEnabled());
  }, []);

  useEffect(() => {
    const apply = () => setResText(resolutionLabel(scale));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [scale]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const apply = () => {
      const h = el.offsetHeight;
      const cur = getComputedStyle(document.documentElement).getPropertyValue("--taskbar-h").trim();
      const next = `${h}px`;
      if (cur === next) return;
      document.documentElement.style.setProperty("--taskbar-h", next);
      clampAll();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampAll, scale]);

  function launch(kind: WinKind, id: string, title: string) {
    if (kind === "contacts") ensureContacts();
    else open({ id, kind, title });
    setMenu(false);
  }

  async function enableGps() {
    setGpsBusy(true);
    setGpsErr(null);
    try {
      const pos = await readDevicePosition();
      const region = await regionFromCoords(pos.lat, pos.lon);
      const text = [region.admin1, region.country].filter(Boolean).join(", ");
      patchProfile({
        gps_consent: true,
        location_mode: "device",
        location_kind: "device",
        location_text: text,
      });
      setGpsAsk(false);
      await setGps({ data: { enabled: true, admin1: region.admin1, country: region.country } });
      await pingNearestGhost({ lat: pos.lat, lon: pos.lon, announce: true });
    } catch (e) {
      patchProfile({ gps_consent: false, location_kind: "stated" });
      setGpsErr(e instanceof Error ? e.message : "GPS stayed off.");
    } finally {
      setGpsBusy(false);
    }
  }

  async function disableGps() {
    setGpsBusy(true);
    try {
      patchProfile({
        gps_consent: false,
        location_mode: "stated",
        location_kind: profile?.stated_location || profile?.location_text ? "stated" : "none",
      });
      await setGps({ data: { enabled: false } });
      await pingNearestGhost({ announce: false });
    } finally {
      setGpsBusy(false);
    }
  }

  return (
    <div
      ref={barRef}
      className="desk-taskbar relative flex min-h-11 flex-wrap items-center gap-1 border-t border-border-strong bg-taskbar px-2 py-1 text-ink"
      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
    >
      <div className="relative">
        <button
          type="button"
          className="flex h-9 items-center gap-2 border border-border-strong bg-paper px-2 hover:bg-paper-elevated"
          onClick={() => setMenu((v) => !v)}
        >
          <LogoMark className="h-6 w-6" />
          <span className="hidden text-sm font-medium sm:inline">Cree Sanctum</span>
        </button>
        {menu && (
          <ul className="absolute bottom-11 left-0 w-56 border border-border-strong bg-paper py-1 shadow-[2px_2px_0_0_rgba(22,48,46,0.18)]">
            {APPS.map((a) => {
              const dark = a.stealthOk === false && stealth;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className={
                      dark
                        ? "flex min-h-11 w-full items-center px-3 text-left text-muted"
                        : "flex min-h-11 w-full items-center px-3 text-left hover:bg-signal-fog"
                    }
                    onClick={() => launch(a.kind, a.id, a.title)}
                  >
                    {dark ? `${a.title} (Stealth is on)` : a.title}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Open windows">
        {windows.map((w) => (
            <button
              key={w.id}
              type="button"
              className={cn(
                "h-9 max-w-40 truncate border px-2 text-sm",
                w.minimized
                  ? "border-border bg-desk-deep"
                  : "border-border-strong bg-paper",
              )}
              onClick={() => {
                if (w.kind === "firstrun") focus(w.id);
                else if (w.minimized) focus(w.id);
                else toggleMin(w.id);
              }}
            >
              {w.title}
            </button>
          ))}
      </div>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Display resolution">
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-border-strong bg-paper hover:bg-paper-elevated"
          title="Native resolution (100%) — tidy windows. Esc does the same."
          aria-label="Reset desk"
          onClick={() => tidyDesk()}
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-border bg-paper text-base hover:bg-paper-elevated disabled:opacity-40"
          aria-label="Lower resolution"
          title={`Lower resolution — larger type. ${resText}`}
          disabled={!canLower}
          onClick={() => nudgeResolution(-1)}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-border bg-paper text-base hover:bg-paper-elevated disabled:opacity-40"
          aria-label="Higher resolution"
          title={`Higher resolution — more desk. ${resText}`}
          disabled={!canRaise}
          onClick={() => nudgeResolution(1)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        title={audioOn ? "Audio on" : "Audio muted"}
        aria-label={audioOn ? "Audio on" : "Audio muted"}
        aria-pressed={!audioOn}
        className="grid h-9 w-9 place-items-center border border-border bg-paper hover:bg-paper-elevated"
        onClick={() => {
          const next = !audioOn;
          setAudioOn(next);
          setAudioOutEnabled(next);
        }}
      >
        {audioOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
      <button
        type="button"
        title="Mute mic cuts local capture except an in-chat voice note"
        aria-label={micOn ? "Mic on" : "Mute mic"}
        aria-pressed={!micOn}
        className="grid h-9 w-9 place-items-center border border-border bg-paper hover:bg-paper-elevated"
        onClick={() => {
          const next = !micOn;
          setMicOn(next);
          setMicEnabled(next);
        }}
      >
        {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </button>
      <button
        type="button"
        title={gpsOn ? `GPS on${gpsLine ? ` · ${gpsLine}` : ""}` : "GPS off"}
        aria-label={gpsOn ? "GPS Enabled" : "GPS Off"}
        aria-pressed={gpsOn}
        disabled={gpsBusy}
        onClick={() => {
          if (gpsOn) void disableGps();
          else setGpsAsk(true);
        }}
        className="grid h-9 w-9 place-items-center border border-border bg-paper hover:bg-paper-elevated"
      >
        <MapPin className={cn("h-4 w-4", gpsOn ? "text-signal" : "text-danger")} />
        <span className="sr-only">{gpsOn ? "GPS Enabled" : "GPS Off"}</span>
      </button>
      <div className="ml-auto flex min-w-0 max-w-[min(100%,18rem)] shrink-0 items-center gap-2">
        <div className="flex shrink-0 flex-col items-end justify-center px-1 leading-tight">
          <p className="font-mono text-xs tabular-nums">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="font-mono text-xs tabular-nums text-ink-soft">
            {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </p>
          <p className="text-xs text-ink-soft">Sanctum WebOS</p>
        </div>
        {user ? (
          <div className="flex max-w-[9rem] min-w-0 flex-col items-end justify-center leading-tight">
            <span className="w-full truncate text-right text-sm font-medium">{label}</span>
            {authEnabled && !gateSession && (
              <button
                type="button"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  void signOut().catch(() => setSigningOut(false));
                }}
                className="cursor-pointer text-xs underline-offset-4 opacity-70 hover:underline disabled:cursor-wait"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {gpsAsk && (
        <div className="absolute bottom-12 right-2 z-[220] w-[min(28rem,calc(100%-1rem))] border border-border-strong bg-paper p-4 shadow-[2px_2px_0_0_rgba(22,48,46,0.18)]">
          <p className="font-medium">Turn GPS on?</p>
          <p className="mt-2 text-sm text-ink-soft">
            You are about to reveal a device-reported region (state/province and
            country only). The network will not guess it from Wi-Fi, IP, or
            Discover. Location is not used to rank people. Turning this on locks
            your stated location string. Turning it off unlocks the string again.
            A mocked device can still lie.
          </p>
          {gpsErr && <p className="mt-2 text-sm text-danger">{gpsErr}</p>}
          <div className="mt-3 flex gap-2">
            <Button disabled={gpsBusy} onClick={() => void enableGps()}>
              {gpsBusy ? "Reading device…" : "Enable GPS"}
            </Button>
            <Button variant="secondary" onClick={() => setGpsAsk(false)}>
              Keep off
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
