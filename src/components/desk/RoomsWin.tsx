import { useEffect, useState } from "react";
import { listConversations, sendFriendRequest } from "@/lib/server/mailbox";
import { listNetworkServants } from "@/lib/server/ghosts";
import { useSanctum } from "../SanctumProvider";
import { useDesk } from "@/lib/desk/store";
import { SqPortrait } from "./SqPortrait";
import { Button } from "../ui/button";
import { ServantSheet } from "../ServantSheet";
import type { ServantCardData } from "../ServantCard";

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

export function RoomsWin() {
  const { stealth, activeSeatId } = useSanctum();
  const { openChat, open } = useDesk();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [servants, setServants] = useState<ServantCardData[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ServantCardData | null>(null);

  async function loadServants() {
    const r = await listNetworkServants();
    setServants((r.servants as ServantCardData[]) ?? []);
  }

  useEffect(() => {
    void listConversations({ data: { asSeatId: activeSeatId } }).then((rows) =>
      setConvos(rows as Convo[]),
    );
    void loadServants();
    const t = setInterval(() => {
      void listConversations({ data: { asSeatId: activeSeatId } }).then((rows) =>
        setConvos(rows as Convo[]),
      );
    }, 8000);
    return () => clearInterval(t);
  }, [activeSeatId]);

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
      openChat(id, name);
      if (res.algorithmStarted) {
        open({ id: "nodelog", kind: "nodelog", title: "Node log", x: 160, y: 80, w: 560, h: 400 });
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusyId(null);
    }
  }

  const poles = servants.filter((s) => s.servant_role === "pole");
  const nets = servants.filter((s) => s.servant_role === "network");

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      <div>
        <h1 className="text-xl">Network</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ryder and Charlie are pals you befriend here so the ranking engine has a
          pole to chew — no GPS required. Regional ghosts find you when GPS is on.
          They are not people.
        </p>
      </div>

      {stealth && (
        <div className="border border-signal bg-paper-elevated px-3 py-2 text-sm">
          Stealth is on. Discover is dark. Existing friends and encrypted rooms stay.
        </div>
      )}

      {notice && (
        <p className="border border-signal/40 bg-signal-fog px-3 py-2 text-sm">{notice}</p>
      )}

      <section className="space-y-2">
        <h2 className="text-lg">Poles · pick one</h2>
        <p className="text-sm text-muted">
          Ryder is North. Charlie is South. Adding one releases the other. Both
          send your words back as a mirror. Befriend a pole to use the ranking
          engine without turning GPS on.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {poles.map((s) => (
            <RoomServant
              key={s.id}
              s={s}
              busy={busyId === s.id}
              onAdd={() => void addServant(s.id, s.display_name)}
              onOpen={() => setSheet(s)}
              onChat={() => openChat(s.id, s.display_name)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg">Regional networks</h2>
        <p className="text-sm text-muted">
          Ten nodes. GPS is what makes a ghost send a request. Accept it in
          Contacts. They do not appear in username search.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {nets.map((s) => (
            <RoomServant
              key={s.id}
              s={s}
              busy={busyId === s.id}
              gpsOnly
              onAdd={() => void addServant(s.id, s.display_name)}
              onOpen={() => setSheet(s)}
              onChat={() => openChat(s.id, s.display_name)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg">Ciphertext rooms</h2>
        <ul className="space-y-2">
          {convos.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 border border-border bg-paper-elevated px-3 py-2 text-left hover:bg-signal-fog"
                onClick={() => openChat(c.other_user.id, c.other_user.display_name)}
              >
                <SqPortrait
                  src={c.other_user.photo_data}
                  name={c.other_user.display_name}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.other_user.display_name}</p>
                  <p className="text-sm text-muted">
                    {c.last_message_at
                      ? new Date(c.last_message_at).toLocaleString()
                      : "No messages yet"}
                    {c.other_user.kind === "servant" ? " · ghost" : ""}
                  </p>
                </div>
                {c.unread_count > 0 && (
                  <span className="grid h-8 min-w-8 place-items-center bg-signal px-2 text-sm text-ink">
                    {c.unread_count}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {convos.length === 0 && (
          <p className="text-sm text-muted">No ciphertext yet. Befriend a pole, or accept a GPS ghost, then speak.</p>
        )}
      </section>
      </div>

      {sheet && (
        <ServantSheet
          s={sheet}
          busy={busyId === sheet.id}
          embedded
          onClose={() => {
            setSheet(null);
            void loadServants();
          }}
          onBefriend={
            sheet.servant_role === "pole" || sheet.is_friend
              ? async () => {
                  await addServant(sheet.id, sheet.display_name);
                  setSheet(null);
                }
              : undefined
          }
          onChat={() => {
            openChat(sheet.id, sheet.display_name);
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

function RoomServant({
  s,
  onAdd,
  onOpen,
  onChat,
  busy,
  gpsOnly,
}: {
  s: ServantCardData;
  onAdd: () => void;
  onOpen: () => void;
  onChat: () => void;
  busy?: boolean;
  gpsOnly?: boolean;
}) {
  return (
    <article className="border border-signal/50 bg-paper-elevated p-3">
      <div className="flex items-start gap-3">
        <SqPortrait src={s.photo_data} name={s.display_name} />
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
        <p className="mt-2 bg-paper-inset px-2 py-1 text-sm italic text-ink-soft">{s.mood_text}</p>
      )}
      <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{s.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {s.is_friend ? (
          <Button onClick={onChat}>Open mirrored room</Button>
        ) : gpsOnly ? (
          <p className="text-sm text-muted">Turns up when GPS is on.</p>
        ) : (
          <Button disabled={busy} onClick={onAdd}>
            Befriend this pole
          </Button>
        )}
        <Button variant="secondary" onClick={onOpen}>
          Look at this process
        </Button>
      </div>
    </article>
  );
}
