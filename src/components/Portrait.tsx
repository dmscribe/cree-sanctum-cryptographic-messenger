import { Radio } from "lucide-react";
import { cn, safePhotoSrc } from "@/lib/utils";

/**
 * In-app display only. No download control. Screenshots still exist — we say so.
 * Network servants: red ring + Radio mark labeled “Network Servant.” Not people.
 */
export function Portrait({
  src,
  name,
  size = "md",
  servant = false,
}: {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  servant?: boolean;
}) {
  const dim = size === "sm" ? "h-11 w-11 text-base" : size === "lg" ? "h-24 w-24 text-3xl" : "h-14 w-14 text-lg";
  const initial = name.trim().slice(0, 1).toUpperCase() || "·";
  const photo = safePhotoSrc(src);
  return (
    <div className="inline-flex flex-col items-center gap-1">
      {servant && (
        <span
          title="Network Servant — not a person"
          className="flex max-w-[11rem] items-center justify-center gap-1 rounded-sm border border-signal bg-paper px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-signal"
        >
          <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Network Servant
        </span>
      )}
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-full bg-signal-fog text-signal grid place-items-center font-display",
          dim,
          servant && "ring-[3px] ring-signal ring-offset-2 ring-offset-paper",
        )}
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            draggable={false}
            className="h-full w-full object-cover pointer-events-none select-none"
            style={{ WebkitUserDrag: "none" } as React.CSSProperties}
          />
        ) : (
          <span aria-hidden>{initial}</span>
        )}
      </div>
    </div>
  );
}
