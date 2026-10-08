import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { acceptFriend, listFriends } from "@/lib/server/mailbox";
import { useSanctum } from "./SanctumProvider";
import { Portrait } from "./Portrait";
import { Button } from "./ui/button";

export function FriendsPanel() {
  const { activeSeatId } = useSanctum();
  const [friends, setFriends] = useState<
    { id: string; display_name: string; username: string; photo_data?: string | null; kind?: string; stealth?: boolean; region?: string | null }[]
  >([]);
  const [incoming, setIncoming] = useState<{ id: string; display_name: string; request_id: string; photo_data?: string | null; found_via?: string; username?: string }[]>([]);

  async function load() {
    const r = await listFriends({ data: { asSeatId: activeSeatId } });
    setFriends(r.friends);
    setIncoming(r.incoming);
  }

  useEffect(() => {
    void load();
  }, [activeSeatId]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl">Friends</h1>
      <p className="text-ink-soft">
        Add friends through Discover while you participate. Stealth users are
        not prey — they will not appear on the radar.
      </p>
      {incoming.length > 0 && (
        <section>
          <h2 className="text-xl">Requests</h2>
          <ul className="mt-2 space-y-2">
            {incoming.map((r) => (
              <li key={r.request_id} className="flex items-center gap-3 rounded-xl border border-border bg-paper-elevated px-4 py-3">
                <Portrait src={r.photo_data} name={r.display_name} size="sm" />
                <span className="flex-1">
                  {r.display_name}
                  {r.found_via ? <span className="block text-sm text-muted">{r.found_via}</span> : null}
                </span>
                <Button
                  onClick={async () => {
                    await acceptFriend({ data: { fromId: r.id } });
                    void load();
                  }}
                >
                  Accept
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="space-y-2">
        {friends.map((f) => (
          <li key={f.id}>
            <Link
              to="/chat/$peerId"
              params={{ peerId: f.id }}
              className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-paper-elevated px-4 pt-4"
            >
              <Portrait src={f.photo_data} name={f.display_name} size="sm" servant={f.kind === "servant"} />
              <div className="flex-1">
                <p className="font-medium">{f.display_name}</p>
                <p className="text-sm text-muted">
                  {f.kind === "servant"
                    ? `Network servant · ${f.region ?? "node"}`
                    : f.stealth
                      ? "Friend · stealth"
                      : "Friend"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {friends.length === 0 && <p className="text-muted">No friends yet.</p>}
    </div>
  );
}
