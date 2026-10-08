import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { listConversations, sendFriendRequest } from "@/lib/server/mailbox";
import { listNetworkServants } from "@/lib/server/ghosts";
import { useSanctum } from "./SanctumProvider";
import { Portrait } from "./Portrait";
import { FirstRun } from "./FirstRun";
import { ServantCard, type ServantCardData } from "./ServantCard";
import { ServantSheet } from "./ServantSheet";

type Convo = {
  id: string;
  unread_count: number;
  last_message_at: string | null;
  other_user: {
    id: string;
    display_name: string;
    username: string;
    photo_data?: string | null;
    kind?: string;
  };
};

export function RoomsHome() {
  const { firstRun, ready, stealth, activeSeatId } = useSanctum();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [servants, setServants] = useState<ServantCardData[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<ServantCardData | null>(null);
  const navigate = useNavigate();

  async function loadServants() {
    const r = await listNetworkServants();
    setServants((r.servants as ServantCardData[]) ?? []);
  }

  useEffect(() => {
    if (!ready || firstRun) return;
    void listConversations({ data: { asSeatId: activeSeatId } }).then(setConvos);
    void loadServants();
    const t = setInterval(() => {
      void listConversations({ data: { asSeatId: activeSeatId } }).then(setConvos);
    }, 5000);
    return () => clearInterval(t);
  }, [ready, firstRun, activeSeatId]);

  async function addServant(id: string, name: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const res = await sendFriendRequest({ data: { toId: id } });
      let msg = `Mirrored room with ${name} is open. They send back what you send.`;
      if (res.replaced) {
        msg = `${res.replaced} was released. You cannot hold both poles. ${msg}`;
      }
      setNotice(msg);
      await loadServants();
      if (res.algorithmStarted) {
        void navigate({ to: "/console" });
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return <p className="text-muted">Opening the cockpit…</p>;
  }
  if (firstRun) return <FirstRun />;

  const poles = servants.filter((s) => s.servant_role === "pole");
  const nets = servants.filter((s) => s.servant_role === "network");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Network</h1>
        <p className="mt-2 text-ink-soft">
          Sealed text and walkie-talkie voice. The server never sees the story.
          Ryder and Charlie are pals you befriend here. Regional ghosts find you when GPS is on.
        </p>
      </div>

      {stealth && (
        <div className="rounded-xl border border-signal bg-paper-elevated px-4 py-3">
          Stealth is on. Discover is dark. Existing friends and encrypted rooms
          stay.
        </div>
      )}

      {notice && (
        <p className="rounded-xl border border-signal/40 bg-signal-fog px-4 py-3 text-sm">{notice}</p>
      )}

      <section className="space-y-3">
        <h2 className="text-xl">Poles · pick one</h2>
        <p className="text-sm text-muted">
          Ryder is North. Charlie is South. Adding one releases the other. Both
          send your words back as a mirror.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {poles.map((s) => (
            <ServantCard
              key={s.id}
              s={s}
              busy={busyId === s.id}
              onAdd={() => void addServant(s.id, s.display_name)}
              onOpen={() => setOpen(s)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl">Regional networks</h2>
        <p className="text-sm text-muted">
          Ten fake nodes across North America. Befriend one and you are on that
          network. Same red mark. Same 14-hour unblock.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {nets.map((s) => (
            <ServantCard
              key={s.id}
              s={s}
              busy={busyId === s.id}
              onAdd={() => void addServant(s.id, s.display_name)}
              onOpen={() => setOpen(s)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl">Ciphertext rooms</h2>
        <ul className="space-y-2">
          {convos.map((c) => (
            <li key={c.id}>
              <Link
                to="/chat/$peerId"
                params={{ peerId: c.other_user.id }}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-paper-elevated px-4 pt-3"
              >
                <Portrait
                  src={c.other_user.photo_data}
                  name={c.other_user.display_name}
                  servant={c.other_user.kind === "servant"}
                />
                <div className="flex-1">
                  <p className="font-medium">{c.other_user.display_name}</p>
                  <p className="text-sm text-muted">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "No messages yet"}
                  </p>
                </div>
                {c.unread_count > 0 && (
                  <span className="grid h-8 min-w-8 place-items-center rounded-full bg-signal px-2 text-sm text-ink">
                    {c.unread_count}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        {convos.length === 0 && (
          <p className="text-muted">No ciphertext yet. Befriend a network servant and speak.</p>
        )}
      </section>

      {open && (
        <ServantSheet
          s={open}
          busy={busyId === open.id}
          onClose={() => {
            setOpen(null);
            void loadServants();
          }}
          onBefriend={async () => {
            await addServant(open.id, open.display_name);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}
