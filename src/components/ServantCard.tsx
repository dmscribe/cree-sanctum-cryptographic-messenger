import { Link } from "@tanstack/react-router";
import { Portrait } from "./Portrait";
import { Button } from "./ui/button";

export type ServantCardData = {
  id: string;
  display_name: string;
  username?: string;
  photo_data?: string | null;
  description?: string | null;
  city?: string | null;
  region?: string | null;
  tribe_name?: string | null;
  age?: number | null;
  gender?: string | null;
  mood_text?: string | null;
  servant_role?: string | null;
  is_friend?: boolean;
  exclusive_peer?: string | null;
  openpgp_fingerprint?: string | null;
};

export function ServantCard({
  s,
  onAdd,
  onOpen,
  onChat,
  busy,
}: {
  s: ServantCardData;
  onAdd?: () => void;
  onOpen?: () => void;
  onChat?: () => void;
  busy?: boolean;
}) {
  return (
    <article className="border border-signal/50 bg-paper-elevated p-4">
      <div className="flex items-start gap-3">
        <Portrait src={s.photo_data} name={s.display_name} servant />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{s.display_name}</p>
          <p className="text-sm text-signal">
            {s.region}
            {s.tribe_name ? ` · ${s.tribe_name}` : ""}
          </p>
          <p className="text-sm text-muted">
            {s.city} · {s.age}+ · {s.gender} · not a person
          </p>
        </div>
      </div>
      {s.mood_text && (
        <p className="mt-3 bg-paper-inset px-3 py-2 text-sm italic text-ink-soft">
          {s.mood_text}
        </p>
      )}
      <p className="mt-3 line-clamp-4 text-sm text-ink-soft">{s.description}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {s.is_friend ? (
          onChat ? (
            <Button onClick={onChat}>Open mirrored room</Button>
          ) : (
            <Link to="/chat/$peerId" params={{ peerId: s.id }} className="contents">
              <Button>Open mirrored room</Button>
            </Link>
          )
        ) : (
          <Button disabled={busy} onClick={onAdd}>
            {s.servant_role === "pole" ? "Befriend this pole" : "Join this network"}
          </Button>
        )}
        {onOpen && (
          <Button variant="secondary" onClick={onOpen}>
            Look at this process
          </Button>
        )}
      </div>
    </article>
  );
}
