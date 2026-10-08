export function LogoMark({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Cree Sanctum Cryptographic Messaging"
      className={className}
      draggable={false}
    />
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark className={compact ? "h-12 w-12" : "h-16 w-16"} />
      <div className="leading-tight">
        <p className="font-display text-xl tracking-wide text-ink">Cree Sanctum</p>
        <p className={compact ? "text-xs text-muted" : "text-sm text-muted"}>
          Cryptographic Messaging
        </p>
      </div>
    </div>
  );
}
