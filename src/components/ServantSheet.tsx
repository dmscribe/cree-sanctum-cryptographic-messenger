import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { peekServant } from "@/lib/server/ghosts";
import { blockPerson } from "@/lib/server/radar";
import { formatFingerprint } from "@/lib/sanctum/pgp";
import { Portrait } from "./Portrait";
import { Button } from "./ui/button";
import type { ServantCardData } from "./ServantCard";

export function ServantSheet({
  s,
  busy,
  onClose,
  onBefriend,
  onChat,
  embedded,
}: {
  s: ServantCardData;
  busy?: boolean;
  onClose: () => void;
  onBefriend?: () => void;
  onChat?: () => void;
  embedded?: boolean;
}) {
  const [mood, setMood] = useState<string | null>(s.mood_text ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t: number[] = [];
    void peekServant({ data: { targetId: s.id } }).then((r) => {
      if (!alive) return;
      if (r.random) setMood(r.random);
      t.push(
        window.setTimeout(() => {
          if (alive && r.viewed) setMood(r.viewed);
        }, 700),
      );
    });
    return () => {
      alive = false;
      t.forEach((id) => window.clearTimeout(id));
    };
  }, [s.id]);

  return (
    <div
      className={
        embedded
          ? "absolute inset-0 z-20 grid place-items-center bg-paper/80 p-4"
          : "fixed inset-0 z-30 grid place-items-center bg-paper/80 p-4 backdrop-blur-[2px]"
      }
    >
      <div className="w-full max-w-md border border-signal/60 bg-paper-elevated p-6 pt-8">
        <div className="flex items-center gap-3">
          <Portrait src={s.photo_data} name={s.display_name} size="lg" servant />
          <div>
            <p className="font-display text-2xl">{s.display_name}</p>
            <p className="text-sm text-signal">
              Network servant · not a person
              {s.region ? ` · ${s.region}` : ""}
            </p>
            {s.tribe_name && <p className="text-sm text-muted">{s.tribe_name}</p>}
            <p className="text-sm text-muted">
              {s.city} · {s.age}+ · {s.gender}
            </p>
          </div>
        </div>
        {mood && (
          <p className="mt-4 rounded-md border border-signal/30 bg-paper-inset px-3 py-2 text-sm italic text-ink-soft">
            {mood}
          </p>
        )}
        <p className="mt-3 text-ink-soft">{s.description}</p>
        {s.openpgp_fingerprint && (
          <p className="mt-3 font-mono text-sm">{formatFingerprint(s.openpgp_fingerprint)}</p>
        )}
        <p className="mt-3 text-xs text-muted">
          Abstract portrait. Process, not a face. Blocked servants un-block after 14 hours.
        </p>
        {notice && <p className="mt-3 text-sm text-signal">{notice}</p>}
        <div className="mt-5 flex flex-col gap-2">
          {s.is_friend ? (
            onChat ? (
              <Button onClick={onChat}>Open mirrored room</Button>
            ) : (
              <Link to="/chat/$peerId" params={{ peerId: s.id }} className="contents">
                <Button>Open mirrored room</Button>
              </Link>
            )
          ) : (
            onBefriend && (
              <Button disabled={busy} onClick={onBefriend}>
                {s.servant_role === "pole" ? "Befriend this pole" : "Join this network"}
              </Button>
            )
          )}
          <Button
            variant="secondary"
            onClick={async () => {
              await blockPerson({ data: { targetId: s.id } });
              setNotice("Blocked. This process un-blocks after 14 hours.");
            }}
          >
            Block for 14 hours
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
