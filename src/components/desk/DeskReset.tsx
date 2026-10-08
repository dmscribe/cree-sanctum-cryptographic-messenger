import { useEffect } from "react";
import { useDesk } from "@/lib/desk/store";

/** Esc restores native scale and tidy windows. The button lives on the taskbar so it cannot cover Close. */
export function DeskReset() {
  const tidyDesk = useDesk((s) => s.tidyDesk);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      tidyDesk();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tidyDesk]);

  return null;
}
