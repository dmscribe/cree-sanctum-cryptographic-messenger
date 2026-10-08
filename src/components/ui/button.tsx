import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ className, variant = "primary", type = "button", ...props }, ref) {
  const styles: Record<Variant, string> = {
    primary:
      "bg-signal text-paper hover:bg-signal-deep disabled:opacity-40",
    secondary:
      "bg-paper-elevated text-ink border border-border-strong hover:border-signal",
    ghost: "bg-transparent text-ink hover:bg-paper-inset",
    danger: "bg-danger text-paper hover:opacity-90 disabled:opacity-40",
    quiet: "bg-signal-fog text-signal-deep hover:bg-signal-fog/80",
  };
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-base font-medium transition-colors duration-(--motion-quick,150ms)",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
});
