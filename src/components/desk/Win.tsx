import { useEffect, useRef, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDesk, type WinRec, deskScale, isPhoneViewport, isTabletViewport } from "@/lib/desk/store";
import { LogoMark } from "../LogoMark";

export function useDeskBreakpoints() {
  const scale = useDesk((s) => s.scale);
  const [phone, setPhone] = useState(false);
  const [tablet, setTablet] = useState(false);
  useEffect(() => {
    const apply = () => {
      setPhone(isPhoneViewport());
      setTablet(isTabletViewport());
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [scale]);
  return { phone, tablet };
}

export function Win({
  win,
  children,
  noClose,
  noMin,
}: {
  win: WinRec;
  children: React.ReactNode;
  noClose?: boolean;
  noMin?: boolean;
}) {
  const { focus, close, toggleMin, toggleMax, move, resize, windows } = useDesk();
  const { phone, tablet } = useDeskBreakpoints();
  const drag = useRef<{
    mode: "move" | "resize";
    ox: number;
    oy: number;
    x: number;
    y: number;
    w: number;
    h: number;
    edge: string;
  } | null>(null);

  if (win.minimized) return null;

  const visible = windows.filter((w) => !w.minimized);
  const topZ = Math.max(0, ...visible.map((w) => w.z));
  const isTop = win.z === topZ;
  const contactsDock = tablet && win.kind === "contacts" && !win.maximized;
  const fillPhone = phone;
  const fillTablet = tablet && isTop && win.maximized;

  if (phone && !isTop) return null;
  if (tablet && !isTop && win.kind !== "contacts") return null;

  const maxH = `calc(100% - ${Math.max(0, win.y) + 4}px)`;
  const fillH = "calc(100% - 8px)";

  let style: React.CSSProperties;
  if (fillPhone) {
    style = {
      left: 4,
      top: 4,
      width: "calc(100% - 8px)",
      height: fillH,
      zIndex: win.z,
    };
  } else if (contactsDock) {
    style = {
      left: 4,
      top: 4,
      width: "min(380px, 42%)",
      height: fillH,
      zIndex: win.z,
    };
  } else if (fillTablet) {
    style = {
      left: 4,
      top: 4,
      width: "calc(100% - 8px)",
      height: fillH,
      zIndex: win.z,
    };
  } else if (tablet && isTop) {
    style = {
      left: "calc(min(380px, 42%) + 8px)",
      top: 4,
      width: "calc(100% - min(380px, 42%) - 12px)",
      height: fillH,
      zIndex: win.z,
    };
  } else if (win.maximized) {
    style = {
      left: 8,
      top: 8,
      width: "calc(100% - 16px)",
      height: "calc(100% - 16px)",
      zIndex: win.z,
    };
  } else {
    style = {
      left: win.x,
      top: win.y,
      width: win.w,
      height: win.h,
      maxWidth: `calc(100% - ${Math.max(0, win.x) + 8}px)`,
      maxHeight: maxH,
      zIndex: win.z,
    };
  }

  const innerFlex = win.kind === "contacts" || win.kind === "chat" || win.kind === "rooms";

  function onTitleDown(e: React.PointerEvent) {
    if (win.maximized || fillPhone || fillTablet) return;
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: "move", ox: e.clientX, oy: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h, edge: "" };
    focus(win.id);
  }

  function onHandleDown(edge: string) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = {
        mode: "resize",
        ox: e.clientX,
        oy: e.clientY,
        x: win.x,
        y: win.y,
        w: win.w,
        h: win.h,
        edge,
      };
      focus(win.id);
    };
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const s = deskScale() || 1;
    const dx = (e.clientX - d.ox) / s;
    const dy = (e.clientY - d.oy) / s;
    if (d.mode === "move") {
      move(win.id, Math.max(0, d.x + dx), Math.max(0, d.y + dy));
      return;
    }
    let { x, y, w, h } = d;
    if (d.edge.includes("e")) w = d.w + dx;
    if (d.edge.includes("s")) h = d.h + dy;
    if (d.edge.includes("w")) {
      w = d.w - dx;
      x = d.x + dx;
    }
    if (d.edge.includes("n")) {
      h = d.h - dy;
      y = d.y + dy;
    }
    resize(win.id, x, y, w, h);
  }

  function onUp() {
    drag.current = null;
  }

  const showSideHandles = !win.maximized && !fillPhone && !fillTablet;
  const showSouthHandle = !innerFlex && !win.maximized && !fillPhone && !fillTablet;

  return (
    <div
      className="desk-win absolute flex flex-col overflow-hidden border border-border-strong bg-paper text-ink shadow-[2px_2px_0_0_rgba(22,48,46,0.18)]"
      style={style}
      onPointerDown={() => focus(win.id)}
    >
      <div
        className="flex h-9 shrink-0 cursor-grab items-center gap-2 border-b border-border bg-titlebar px-2 active:cursor-grabbing"
        onPointerDown={onTitleDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <LogoMark className="h-5 w-5" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{win.title}</span>
        {!noMin && (
          <button
            type="button"
            className="grid h-7 w-7 place-items-center border border-border bg-paper hover:bg-paper-inset"
            onClick={() => toggleMin(win.id)}
            aria-label="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="grid h-7 w-7 place-items-center border border-border bg-paper hover:bg-paper-inset"
          onClick={() => toggleMax(win.id)}
          aria-label={win.maximized ? "Restore size" : "Maximise"}
          title={win.maximized ? "Restore size" : "Maximise"}
        >
          <Square className="h-3 w-3" />
        </button>
        {!noClose && (
          <button
            type="button"
            className="grid h-7 w-7 place-items-center border border-border bg-paper text-danger hover:bg-danger-fog"
            onClick={() => close(win.id)}
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div
        className={
          innerFlex
            ? "desk-win-body flex min-h-0 flex-1 flex-col overflow-hidden bg-paper"
            : "desk-win-body min-h-0 flex-1 overflow-y-auto overscroll-contain bg-paper pb-4"
        }
      >
        {children}
      </div>
      {showSouthHandle && (
        <Handle
          className="absolute inset-x-0 bottom-0 z-20 flex h-4 cursor-s-resize items-end justify-center pb-0.5"
          onPointerDown={onHandleDown("s")}
          onPointerMove={onMove}
          onPointerUp={onUp}
          title="Drag to change height"
        >
          <span className="block h-1 w-12 bg-border-strong" aria-hidden />
        </Handle>
      )}
      {showSideHandles && (
        <>
          <Handle className="absolute inset-x-2 bottom-0 h-1.5 cursor-s-resize" onPointerDown={onHandleDown("s")} onPointerMove={onMove} onPointerUp={onUp} />
          <Handle className="absolute inset-y-8 right-0 w-1.5 cursor-e-resize" onPointerDown={onHandleDown("e")} onPointerMove={onMove} onPointerUp={onUp} />
          <Handle className="absolute inset-y-8 left-0 w-1.5 cursor-w-resize" onPointerDown={onHandleDown("w")} onPointerMove={onMove} onPointerUp={onUp} />
          <Handle className="absolute inset-x-2 top-0 h-1 cursor-n-resize" onPointerDown={onHandleDown("n")} onPointerMove={onMove} onPointerUp={onUp} />
          <Handle className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-se-resize" onPointerDown={onHandleDown("se")} onPointerMove={onMove} onPointerUp={onUp} />
          <Handle className="absolute bottom-0 left-0 z-20 h-4 w-4 cursor-sw-resize" onPointerDown={onHandleDown("sw")} onPointerMove={onMove} onPointerUp={onUp} />
        </>
      )}
    </div>
  );
}

function Handle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { className?: string }) {
  return (
    <div className={cn("z-10", className)} {...rest}>
      {children}
    </div>
  );
}
