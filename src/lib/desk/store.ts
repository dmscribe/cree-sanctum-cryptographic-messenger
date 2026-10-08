import { create } from "zustand";

export type WinKind =
  | "contacts"
  | "rooms"
  | "chat"
  | "card"
  | "moods"
  | "discover"
  | "views"
  | "identity"
  | "nodelog"
  | "about"
  | "firstrun";

export type WinRec = {
  id: string;
  kind: WinKind;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  peerId?: string;
};

export type PeerMark = { inbound: boolean; outbound: boolean; unread: number };

/** UI magnification. Lower = higher resolution (more desk). Higher = larger chrome. */
export const DESK_SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3] as const;
const SCALE_KEY = "sanctum-desk-scale";

export function snapScale(n: number): number {
  let best: number = 1;
  let dist = Infinity;
  for (const s of DESK_SCALES) {
    const d = Math.abs(s - n);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

export function loadStoredScale(): number {
  if (typeof window === "undefined") return 1;
  try {
    const n = Number(window.localStorage.getItem(SCALE_KEY));
    if (!Number.isFinite(n) || n <= 0) return 1;
    if (!(DESK_SCALES as readonly number[]).includes(n)) return 1;
    return n;
  } catch {
    /* private mode */
  }
  return 1;
}

export function applyDeskScale(scale: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--desk-scale", String(scale));
  try {
    window.localStorage.setItem(SCALE_KEY, String(scale));
  } catch {
    /* private mode */
  }
}

export function deskScale(): number {
  if (typeof window === "undefined") return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--desk-scale");
  const n = Number.parseFloat(raw);
  return n > 0 ? n : 1;
}

export function resolutionLabel(scale = deskScale()): string {
  if (typeof window === "undefined") return "1280×800";
  const w = Math.max(320, Math.round(window.innerWidth / scale));
  const h = Math.max(200, Math.round(window.innerHeight / scale));
  return `${w}×${h}`;
}

export type DeskNudge = { title: string; body: string };

type DeskState = {
  windows: WinRec[];
  zTop: number;
  marks: Record<string, PeerMark>;
  peopleEpoch: number;
  scale: number;
  nudge: DeskNudge | null;
  open: (partial: Omit<WinRec, "z" | "minimized" | "maximized"> & { minimized?: boolean; maximized?: boolean }) => void;
  focus: (id: string) => void;
  close: (id: string) => void;
  toggleMin: (id: string) => void;
  toggleMax: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, x: number, y: number, w: number, h: number) => void;
  openChat: (peerId: string, name: string) => void;
  openCard: (peerId: string, name: string) => void;
  ensureContacts: () => void;
  setMark: (peerId: string, patch: Partial<PeerMark>) => void;
  clearMark: (peerId: string) => void;
  bumpPeople: () => void;
  clampAll: () => void;
  fitDesk: (id: string) => void;
  tidyDesk: () => void;
  nudgeSize: (id: string, dw: number, dh: number) => void;
  setScale: (scale: number) => void;
  nudgeResolution: (dir: 1 | -1) => void;
  resetScale: () => void;
  showNudge: (nudge: DeskNudge) => void;
  clearNudge: () => void;
};

let zc = 10;

export function deskArea(): { w: number; h: number; bar: number } {
  if (typeof window === "undefined") return { w: 1280, h: 720, bar: 48 };
  const root = document.querySelector(".desk-root") as HTMLElement | null;
  const barEl = document.querySelector(".desk-taskbar") as HTMLElement | null;
  const bar = barEl?.offsetHeight || Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--taskbar-h")) || 48;
  const w = root?.clientWidth || Math.round(window.innerWidth / deskScale());
  const totalH = root?.clientHeight || Math.round((window.innerHeight - bar) / deskScale());
  return {
    w,
    h: Math.max(200, totalH),
    bar,
  };
}

export function clampRect(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const a = deskArea();
  const pad = 4;
  const maxW = Math.max(280, a.w - pad * 2);
  const maxH = Math.max(200, a.h - pad * 2);
  w = Math.min(Math.max(280, w), maxW);
  h = Math.min(Math.max(200, h), maxH);
  x = Math.max(pad, Math.min(x, Math.max(pad, a.w - w - pad)));
  y = Math.max(pad, Math.min(y, Math.max(pad, a.h - h - pad)));
  return { x, y, w, h };
}

function layoutFor(kind: WinKind, i: number) {
  const a = deskArea();
  const pad = 8;
  const usableW = Math.max(280, a.w - pad * 2);
  const usableH = Math.max(200, a.h - pad * 2);
  const left = Math.min(400, Math.max(300, Math.round(usableW * 0.32)));
  const restX = pad + left + 10;
  const restW = Math.max(300, usableW - left - 10);
  const step = (i % 4) * 16;

  switch (kind) {
    case "contacts":
      return clampRect(pad, pad, left, usableH);
    case "chat":
      return clampRect(
        restX + (i % 3) * 16,
        pad + (i % 3) * 8,
        Math.min(Math.max(420, restW - 8), restW),
        usableH,
      );
    case "rooms":
      return clampRect(restX, pad, Math.min(restW, 720), usableH);
    case "discover":
      return clampRect(restX, pad, Math.min(restW, 700), usableH);
    case "identity":
      return clampRect(restX, pad, Math.min(restW, 540), usableH);
    case "about":
      return clampRect(pad + 40, pad, Math.min(540, usableW - 48), Math.min(usableH, 560));
    case "moods":
      return clampRect(restX, pad, Math.min(440, restW), Math.min(usableH, 520));
    case "views":
      return clampRect(restX, pad + 12, Math.min(420, restW), Math.min(usableH - 12, 500));
    case "card":
      return clampRect(restX + 24, pad + 24, Math.min(380, restW), Math.min(usableH - 24, 520));
    case "nodelog":
      return clampRect(restX, pad + 16, Math.min(560, restW), Math.min(usableH - 16, 440));
    case "firstrun":
      return clampRect(pad + 24, pad, Math.min(500, usableW - 48), Math.min(usableH, 580));
    default:
      return clampRect(pad + step, pad + step, Math.min(480, usableW), Math.min(440, usableH));
  }
}

function cascade(kind: WinKind, i: number) {
  return layoutFor(kind, i);
}

export function viewportBox(): { w: number; h: number } {
  if (typeof window === "undefined") return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

export function isPhoneViewport(): boolean {
  return viewportBox().w <= 720;
}

export function isTabletViewport(): boolean {
  const w = viewportBox().w;
  return w > 720 && w <= 1100;
}

export const useDesk = create<DeskState>((set, get) => ({
  windows: [],
  zTop: 10,
  marks: {},
  peopleEpoch: 0,
  scale: 1,
  nudge: null,
  open: (partial) => {
    const existing = get().windows.find((w) => w.id === partial.id);
    if (existing) {
      set({
        windows: get().windows.map((w) =>
          w.id === partial.id ? { ...w, minimized: false, z: ++zc } : w,
        ),
        zTop: zc,
      });
      return;
    }
    const pos = cascade(partial.kind, get().windows.length);
    const rec: WinRec = {
      ...pos,
      ...partial,
      ...clampRect(partial.x ?? pos.x, partial.y ?? pos.y, partial.w ?? pos.w, partial.h ?? pos.h),
      z: ++zc,
      minimized: partial.minimized ?? false,
      maximized: partial.maximized ?? isPhoneViewport(),
    };
    set({ windows: [...get().windows, rec], zTop: zc });
  },
  focus: (id) => {
    const cur = get().windows.find((w) => w.id === id);
    if (!cur) return;
    if (!cur.minimized && cur.z === get().zTop) return;
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, z: ++zc, minimized: false } : w)),
      zTop: zc,
    });
  },
  close: (id) => {
    set({ windows: get().windows.filter((w) => w.id !== id) });
  },
  toggleMin: (id) => {
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w)),
    });
  },
  toggleMax: (id) => {
    set({
      windows: get().windows.map((w) =>
        w.id === id ? { ...w, maximized: !w.maximized, minimized: false, z: ++zc } : w,
      ),
      zTop: zc,
    });
  },
  move: (id, x, y) => {
    set({
      windows: get().windows.map((w) => {
        if (w.id !== id) return w;
        const next = clampRect(x, y, w.w, w.h);
        return { ...w, x: next.x, y: next.y };
      }),
    });
  },
  resize: (id, x, y, w, h) => {
    const next = clampRect(x, y, w, h);
    set({
      windows: get().windows.map((win) => (win.id === id ? { ...win, ...next, maximized: false } : win)),
    });
  },
  clampAll: () => {
    set({
      windows: get().windows.map((w) => ({ ...w, ...clampRect(w.x, w.y, w.w, w.h) })),
    });
  },
  fitDesk: (id) => {
    const a = deskArea();
    const fitted = clampRect(8, 8, a.w - 16, a.h - 16);
    set({
      windows: get().windows.map((w) =>
        w.id === id ? { ...w, ...fitted, maximized: true, minimized: false, z: ++zc } : w,
      ),
      zTop: zc,
    });
  },
  tidyDesk: () => {
    applyDeskScale(1);
    set({
      scale: 1,
      windows: get().windows.map((w, i) => {
        const pos = cascade(w.kind, i);
        return { ...w, ...pos, maximized: false, minimized: false };
      }),
    });
  },
  nudgeSize: (id, dw, dh) => {
    const a = deskArea();
    set({
      windows: get().windows.map((w) => {
        if (w.id !== id) return w;
        const base = w.maximized
          ? { x: 8, y: 8, w: Math.min(w.w, a.w - 16), h: a.h - 16 }
          : { x: w.x, y: w.y, w: w.w, h: w.h };
        const next = clampRect(base.x, base.y, base.w + dw, base.h + dh);
        return { ...w, ...next, maximized: false, minimized: false, z: ++zc };
      }),
      zTop: zc,
    });
  },
  setScale: (scale) => {
    const next = snapScale(scale);
    applyDeskScale(next);
    set({ scale: next });
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => get().clampAll());
    }
  },
  nudgeResolution: (dir) => {
    // dir +1 = higher resolution = smaller UI scale (more desk).
    const cur = get().scale;
    const i = DESK_SCALES.findIndex((s) => s === cur);
    const idx = i < 0 ? DESK_SCALES.indexOf(1) : i;
    const next = DESK_SCALES[idx - dir] ?? DESK_SCALES[idx];
    get().setScale(next);
  },
  resetScale: () => {
    get().setScale(1);
  },
  showNudge: (nudge) => {
    set({ nudge });
  },
  clearNudge: () => {
    set({ nudge: null });
  },
  setMark: (peerId, patch) => {
    const cur = get().marks[peerId] ?? { inbound: false, outbound: false, unread: 0 };
    set({ marks: { ...get().marks, [peerId]: { ...cur, ...patch } } });
  },
  clearMark: (peerId) => {
    const next = { ...get().marks };
    delete next[peerId];
    set({ marks: next });
  },
  bumpPeople: () => {
    set({ peopleEpoch: get().peopleEpoch + 1 });
  },
  openChat: (peerId, name) => {
    const id = `chat:${peerId}`;
    const existing = get().windows.find((w) => w.id === id);
    const chats = get().windows.filter((w) => w.kind === "chat").length;
    const pos = layoutFor("chat", chats);
    if (existing) {
      const cluttered = existing.w < 380 || existing.h < Math.min(420, deskArea().h * 0.65);
      set({
        windows: get().windows.map((w) =>
          w.id === id
            ? {
                ...w,
                title: name,
                minimized: false,
                maximized: false,
                z: ++zc,
                ...(cluttered ? pos : {}),
              }
            : w,
        ),
        zTop: zc,
      });
      get().clearMark(peerId);
      return;
    }
    get().open({
      id,
      kind: "chat",
      title: name,
      peerId,
      ...pos,
    });
    get().clearMark(peerId);
  },
  openCard: (peerId, name) => {
    get().open({
      id: `card:${peerId}`,
      kind: "card",
      title: name,
      peerId,
      ...cascade("card", get().windows.length),
    });
  },
  ensureContacts: () => {
    get().open({
      id: "contacts",
      kind: "contacts",
      title: "Contacts",
      ...cascade("contacts", 0),
    });
  },
}));
