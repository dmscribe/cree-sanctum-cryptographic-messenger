import { useEffect } from "react";
import { useDesk } from "@/lib/desk/store";

export function DeskNudge() {
  const { nudge, clearNudge, ensureContacts } = useDesk();

  useEffect(() => {
    if (!nudge) return;
    const t = window.setTimeout(() => clearNudge(), 14000);
    return () => window.clearTimeout(t);
  }, [nudge, clearNudge]);

  if (!nudge) return null;

  return (
    <aside
      role="status"
      className="absolute right-3 z-[300] w-[min(20rem,calc(100%-1.5rem))] border border-border-strong bg-paper text-ink shadow-[2px_2px_0_0_rgba(22,48,46,0.22)]"
      style={{ bottom: "calc(var(--taskbar-h) + 8px)" }}
    >
      <div className="flex items-center justify-between border-b border-border bg-titlebar px-3 py-1">
        <p className="text-sm font-semibold">{nudge.title}</p>
        <button type="button" className="min-h-8 px-2 text-sm text-muted hover:text-ink" onClick={clearNudge} aria-label="Dismiss">
          ×
        </button>
      </div>
      <button
        type="button"
        className="block w-full px-3 py-3 text-left text-sm leading-relaxed hover:bg-signal-fog"
        onClick={() => {
          ensureContacts();
          clearNudge();
        }}
      >
        {nudge.body}
      </button>
    </aside>
  );
}
