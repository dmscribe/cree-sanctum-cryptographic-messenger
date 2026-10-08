import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  bootstrapMe,
  completeFirstRun,
  listMySeats,
  setStealth,
} from "@/lib/server/profile";
import { ensureLocalSeat, republishSeat } from "@/lib/sanctum/session";
import { loadSeat, type SeatVault } from "@/lib/sanctum/vault";

type Card = {
  id: string;
  display_name: string;
  username: string;
  kind?: string;
  stealth?: boolean;
  first_run_done?: boolean;
  discover_on?: boolean;
  mood_text?: string | null;
  username_claimed?: boolean;
  throwaway?: boolean;
  gps_consent?: boolean;
  location_mode?: string;
  location_kind?: string;
  location_text?: string;
  last_active?: string;
  receive_media?: boolean;
};

type Ctx = {
  ready: boolean;
  profile: Card | null;
  firstRun: boolean;
  stealth: boolean;
  seats: Card[];
  activeSeat: SeatVault | null;
  activeSeatId: string;
  setActiveSeatId: (id: string) => void;
  toggleStealth: () => Promise<void>;
  finishFirstRun: (input: {
    displayName: string;
    username?: string;
    description?: string;
    city?: string;
    discoverOn: boolean;
  }) => Promise<void>;
  refresh: () => Promise<void>;
  patchProfile: (partial: Partial<Card>) => void;
};

const SanctumCtx = createContext<Ctx | null>(null);

export function SanctumProvider({
  children,
  ssrUserId,
}: {
  children: ReactNode;
  ssrUserId?: string | null;
}) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? ssrUserId ?? null;
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Card | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [stealth, setStealthState] = useState(false);
  const [seats, setSeats] = useState<Card[]>([]);
  const [activeSeat, setActiveSeat] = useState<SeatVault | null>(null);
  const [activeSeatId, setActiveSeatIdState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("sanctum-active-seat") || "";
  });
  const activeSeatIdRef = useRef(activeSeatId);
  activeSeatIdRef.current = activeSeatId;
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || inflight.current) return;
    inflight.current = true;
    try {
      const boot = await bootstrapMe({ data: {} });
      const card = boot.profile as Card | null;
      setProfile(card);
      setFirstRun(boot.firstRun);
      setStealthState(Boolean(card?.stealth));
      if (boot.firstRun) {
        setReady(true);
        return;
      }
      const listed = (await listMySeats()) as Card[];
      setSeats(listed);
      const seatId = activeSeatIdRef.current || userId;
      const seatCard = listed.find((s) => s.id === seatId);
      let vault = await loadSeat(seatId);
      if (!vault) {
        vault = await ensureLocalSeat(seatId, seatCard?.display_name || "Unsigned");
      } else {
        try {
          await republishSeat(vault);
        } catch {
          /* already published */
        }
      }
      setActiveSeat(vault);
      if (!activeSeatIdRef.current) {
        setActiveSeatIdState(userId);
        try {
          window.sessionStorage.setItem("sanctum-active-seat", userId);
        } catch {
          /* private mode */
        }
      }
      setReady(true);
    } catch (err) {
      console.error("sanctum refresh failed", err);
      setReady(true);
    } finally {
      inflight.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      if (!isPending) setReady(true);
      return;
    }
    void refresh();
  }, [userId, isPending, refresh]);

  const setActiveSeatId = useCallback(async (id: string) => {
    setActiveSeatIdState(id);
    try {
      window.sessionStorage.setItem("sanctum-active-seat", id);
    } catch {
      /* private mode */
    }
    const v = await loadSeat(id);
    if (v) {
      setActiveSeat(v);
      return;
    }
    const vault = await ensureLocalSeat(id, "Seat");
    setActiveSeat(vault);
  }, []);

  const toggleStealth = useCallback(async () => {
    const next = !stealth;
    const res = await setStealth({ data: { stealth: next } });
    setStealthState(res.stealth);
  }, [stealth]);

  const finishFirstRun = useCallback(
    async (input: {
      displayName: string;
      username?: string;
      description?: string;
      city?: string;
      discoverOn: boolean;
    }) => {
      if (!userId) return;
      const done = await completeFirstRun({
        data: {
          displayName: input.displayName,
          username: input.username || undefined,
          description: input.description,
          city: input.city,
          discoverOn: input.discoverOn,
        },
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              display_name: done.label || input.displayName || prev.display_name,
              username: done.username_claimed ? done.username : prev.username,
              username_claimed: Boolean(done.username_claimed),
            }
          : prev,
      );
      const vault = await ensureLocalSeat(userId, input.displayName || "Unsigned");
      setActiveSeat(vault);
      setActiveSeat(vault);
      setActiveSeatIdState(userId);
      try {
        window.sessionStorage.setItem("sanctum-active-seat", userId);
      } catch {
        /* private mode */
      }
      setFirstRun(false);
      setStealthState(!input.discoverOn);
      setReady(true);
      void refresh();
    },
    [userId, refresh],
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      profile,
      firstRun,
      stealth,
      seats,
      activeSeat,
      activeSeatId: activeSeatId || userId || "",
      setActiveSeatId: (id: string) => {
        void setActiveSeatId(id);
      },
      toggleStealth,
      finishFirstRun,
      refresh,
      patchProfile: (partial: Partial<Card>) => {
        setProfile((p) => (p ? { ...p, ...partial } : p));
      },
    }),
    [
      ready,
      profile,
      firstRun,
      stealth,
      seats,
      activeSeat,
      activeSeatId,
      userId,
      setActiveSeatId,
      toggleStealth,
      finishFirstRun,
      refresh,
    ],
  );

  return <SanctumCtx.Provider value={value}>{children}</SanctumCtx.Provider>;
}

export function useSanctum() {
  const ctx = useContext(SanctumCtx);
  if (!ctx) throw new Error("useSanctum outside provider");
  return ctx;
}
