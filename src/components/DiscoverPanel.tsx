import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { dismissCard, getSuggest, openDiscoverCard, searchPeople } from "@/lib/server/radar";
import { sendFriendRequest } from "@/lib/server/mailbox";
import { blockPerson } from "@/lib/server/radar";
import { useSanctum } from "./SanctumProvider";
import { Portrait } from "./Portrait";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatFingerprint } from "@/lib/sanctum/pgp";

type Card = {
  id: string;
  display_name: string;
  username: string;
  description?: string;
  city?: string | null;
  region?: string | null;
  tribe_name?: string | null;
  photo_data?: string | null;
  mood_text?: string | null;
  openpgp_fingerprint?: string | null;
  slot_kind?: "WARM" | "DISCOVER";
  kind?: string;
};

export function DiscoverPanel() {
  const { stealth, firstRun, profile } = useSanctum();
  const [cards, setCards] = useState<Card[]>([]);
  const [warm, setWarm] = useState(0);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Card[]>([]);
  const [grave, setGrave] = useState<{ username: string; laid_down_at: string; last_active_at: string | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [opened, setOpened] = useState<Card | null>(null);
  const [openedFrom, setOpenedFrom] = useState<"discover" | "username">("discover");
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    const res = await getSuggest();
    setCards((res.cards as Card[]) ?? []);
    setWarm(res.warm_count ?? 0);
  }

  function inspect(c: Card, dwellMs: number, source: "discover" | "username" = "discover") {
    setOpened(c);
    setOpenedFrom(source);
    setOpenId(c.id);
    void openDiscoverCard({ data: { targetId: c.id, dwellMs } }).then((r) => {
      if (c.kind !== "servant" && !r.random && !r.viewed) return;
      if (r.random) {
        setOpened((prev) => (prev && prev.id === c.id ? { ...prev, mood_text: r.random as string } : prev));
      }
      window.setTimeout(() => {
        const next =
          (r.viewed as string | null) ||
          `${profile?.display_name || "Someone"} just viewed me. I wonder who they are…?`;
        setOpened((prev) => (prev && prev.id === c.id ? { ...prev, mood_text: next } : prev));
        setCards((prev) => prev.map((x) => (x.id === c.id ? { ...x, mood_text: next } : x)));
      }, 700);
    });
  }

  useEffect(() => {
    if (stealth || firstRun) return;
    void load();
  }, [stealth, firstRun]);

  if (stealth) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl">Discover is dark</h1>
        <p className="text-ink-soft">
          Stealth is on. Nobody new gets a view on you. Cached cards are gone.
          Network you already have still works.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Discover</h1>
        <p className="mt-2 text-ink-soft">
          How the radar works. Nine cards. Two seats for people you already
          brushed against (WARM), seven for growth (DISCOVER). Scores stay on
          the server. Empty WARM is honest.
        </p>
      </div>
      {notice && (
        <p className="rounded-xl border border-signal/40 bg-signal-fog px-4 py-3 text-sm">{notice}</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          void searchPeople({ data: { q } }).then((r) => {
            setHits((r.hits as Card[]) ?? []);
            setGrave((r.grave as typeof grave) ?? null);
          });
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type the exact username" />
        <Button type="submit">Look up</Button>
      </form>
      {grave && (
        <p className="border border-border bg-paper-inset px-3 py-3 text-sm text-ink-soft">
          Gravelog: @{grave.username} once existed and was laid down{" "}
          {new Date(grave.laid_down_at).toLocaleDateString()}. No mood, no photo, no
          chat, no GPS.
        </p>
      )}
      {hits.length > 0 && (
        <ul className="space-y-2">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full min-h-14 items-center gap-3 rounded-xl border border-border bg-paper-elevated px-3 pt-4 text-left"
                onClick={() => inspect(h, 800, "username")}
              >
                <Portrait src={h.photo_data} name={h.display_name} size="sm" servant={h.kind === "servant"} />
                <span>{h.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => inspect(c, 1200, "discover")}
            className="rounded-xl border border-border bg-paper-elevated p-4 text-left"
          >
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{c.slot_kind === "WARM" ? "Warm" : "Discover"}</span>
              <span>{i + 1}/9</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Portrait src={c.photo_data} name={c.display_name} servant={c.kind === "servant"} />
              <div>
                <p className="font-medium">{c.display_name}</p>
                {c.city && <p className="text-sm text-muted">{c.city}</p>}
              </div>
            </div>
            {c.mood_text && <p className="mt-3 text-sm italic">{c.mood_text}</p>}
            <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{c.description}</p>
          </button>
        ))}
      </div>
      {cards.length === 0 && (
        <p className="text-muted">
          The radar is quiet. Befriend Ryder or Charlie in Network, or turn GPS
          on so a regional ghost can find you.
        </p>
      )}
      {warm === 0 && cards.length > 0 && (
        <p className="text-sm text-muted">No warm seats. We will not invent them.</p>
      )}

      {opened && openId && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-paper/80 p-4">
          <div className="w-full max-w-md rounded-xl bg-paper-elevated p-6">
            <div className="flex items-center gap-3">
              <Portrait src={opened.photo_data} name={opened.display_name} size="lg" servant={opened.kind === "servant"} />
              <div>
                <p className="font-display text-2xl">{opened.display_name}</p>
                <p className="text-sm text-muted">@{opened.username}</p>
                {opened.kind === "servant" && (
                  <p className="text-sm text-signal">
                    Network servant · not a person
                    {opened.region ? ` · ${opened.region}` : ""}
                    {opened.tribe_name ? ` · ${opened.tribe_name}` : ""}
                  </p>
                )}
              </div>
            </div>
            {opened.mood_text && <p className="mt-4 italic">{opened.mood_text}</p>}
            <p className="mt-3 text-ink-soft">{opened.description}</p>
            {opened.openpgp_fingerprint && (
              <p className="mt-3 font-mono text-sm">{formatFingerprint(opened.openpgp_fingerprint)}</p>
            )}
            <p className="mt-3 text-xs text-muted">
              Profile photos stay in the app. Screenshots still exist.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {opened.kind !== "servant" && (
                <Button
                  onClick={async () => {
                    try {
                      const res = await sendFriendRequest({ data: { toId: opened.id, source: openedFrom } });
                      if (res.replaced) {
                        setNotice(`${res.replaced} was released. You cannot hold both poles.`);
                      }
                      setOpened(null);
                      if (res.algorithmStarted) void navigate({ to: "/console" });
                      void load();
                    } catch (e) {
                      setNotice(e instanceof Error ? e.message : "Could not add");
                    }
                  }}
                >
                  Send request
                </Button>
              )}
              <Link to="/chat/$peerId" params={{ peerId: opened.id }} className="contents">
                <Button variant="secondary">Open room (if already friends)</Button>
              </Link>
              {opened.kind === "servant" && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await blockPerson({ data: { targetId: opened.id } });
                    setNotice("Blocked. Network servants un-block after 14 hours.");
                    setOpened(null);
                    void load();
                  }}
                >
                  Block for 14 hours
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={async () => {
                  await dismissCard({ data: { targetId: opened.id, warmEligible: opened.slot_kind === "WARM" } });
                  setOpened(null);
                  void load();
                }}
              >
                Dismiss this card
              </Button>
              <Button variant="secondary" onClick={() => setOpened(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
