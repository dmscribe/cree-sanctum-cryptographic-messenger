import { cn, safePhotoSrc } from "@/lib/utils";

export function SqPortrait({
  src,
  name,
  size = "md",
}: {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "h-11 w-11" : size === "lg" ? "h-24 w-24" : "h-14 w-14";
  const initial = name.trim().slice(0, 1).toUpperCase() || "·";
  const photo = safePhotoSrc(src);
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden border border-border bg-paper-inset text-ink grid place-items-center font-medium",
        dim,
      )}
      onContextMenu={(e) => e.preventDefault()}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          draggable={false}
          className="h-full w-full object-cover pointer-events-none select-none"
        />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </div>
  );
}

export function PresenceDot({ presence }: { presence: string }) {
  const color =
    presence === "online"
      ? "bg-online"
      : presence === "away"
        ? "bg-away"
        : presence === "busy"
          ? "bg-busy"
          : "bg-offline";
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", color)} aria-hidden />;
}

export function presenceLabel(p: string): string {
  return (
    { online: "Online", away: "Away", busy: "Busy", invisible: "Invisible", offline: "Offline" }[p] ||
    "Offline"
  );
}
