import { Link, useRouterState } from "@tanstack/react-router";
import { LockKeyhole, Radar, Eye, Users, MessageSquare, BookOpen, Download, Terminal } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import { Wordmark } from "./LogoMark";
import { useSanctum } from "./SanctumProvider";

const NAV = [
  { to: "/", label: "Network", icon: MessageSquare },
  { to: "/discover", label: "Discover", icon: Radar },
  { to: "/views", label: "Views", icon: Eye },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/identity", label: "Identity", icon: LockKeyhole },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { stealth, toggleStealth, activeSeat, seats, setActiveSeatId, activeSeatId } = useSanctum();
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-border bg-paper-elevated">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="min-h-12">
            <Wordmark compact />
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            {seats.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-muted">
                Seat
                <select
                  className="min-h-12 rounded-md border border-border bg-paper px-3 text-ink"
                  value={activeSeatId}
                  onChange={(e) => setActiveSeatId(e.target.value)}
                >
                  {seats.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => void toggleStealth()}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl border px-4 transition-colors",
                stealth
                  ? "border-signal bg-signal text-ink"
                  : "border-signal bg-signal-fog text-ink",
              )}
              aria-pressed={stealth}
            >
              <span className="font-medium">{stealth ? "Stealth on" : "Radar on"}</span>
              <span
                className={cn(
                  "h-6 w-11 rounded-full p-0.5 transition-colors",
                  stealth ? "bg-muted" : "bg-signal",
                )}
              >
                <span
                  className={cn(
                    "block h-5 w-5 rounded-full bg-paper-elevated transition-transform",
                    stealth ? "translate-x-0" : "translate-x-5",
                  )}
                />
              </span>
            </button>
            {isPending ? (
              <div className="h-8 w-28 animate-pulse rounded-full bg-paper-inset" />
            ) : user ? (
              <UserButton />
            ) : null}
          </div>
        </div>
        {activeSeat && (
          <p className="mx-auto max-w-6xl px-4 pb-3 font-mono text-sm text-muted">
            This seat · {activeSeat.identity.fingerprint.replace(/(.{4})/g, "$1 ").trim()}
          </p>
        )}
      </header>

      <div className="mx-auto grid max-w-6xl gap-0 md:grid-cols-[220px_1fr]">
        <nav className="hidden border-r border-border md:block">
          <ul className="sticky top-0 flex flex-col gap-1 p-4">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-md px-3 text-base",
                      active ? "bg-signal-fog text-ink" : "text-ink-soft hover:bg-paper-inset",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                to="/console"
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-md px-3 text-base",
                  pathname.startsWith("/console")
                    ? "bg-signal-fog text-ink"
                    : "text-ink-soft hover:bg-paper-inset",
                )}
              >
                <Terminal className="h-5 w-5" />
                Node log
              </Link>
            </li>
            <li>
              <Link
                to="/source"
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-md px-3 text-base",
                  pathname.startsWith("/source")
                    ? "bg-signal-fog text-ink"
                    : "text-ink-soft hover:bg-paper-inset",
                )}
              >
                <Download className="h-5 w-5" />
                C++ source
              </Link>
            </li>
            <li>
              <Link
                to="/map"
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-md px-3 text-base",
                  pathname.startsWith("/map")
                    ? "bg-signal-fog text-ink"
                    : "text-ink-soft hover:bg-paper-inset",
                )}
              >
                <BookOpen className="h-5 w-5" />
                Project map
              </Link>
            </li>
          </ul>
        </nav>
        <main className="min-h-[70dvh] px-4 py-6 pb-28 md:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-paper-elevated md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 text-sm",
                    active ? "text-signal" : "text-muted",
                  )}
                >
                  <Icon className="h-6 w-6" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
