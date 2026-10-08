import { useEffect, useRef, useState } from "react";
import { listDeskPeople, setMyPresence } from "@/lib/server/mates";
import { acceptFriend, declineFriend, listConversations, removeFriend, sendFriendRequest } from "@/lib/server/mailbox";
import { lookupUsername } from "@/lib/server/profile";
import { flushGhostPings } from "@/lib/server/ghosts";
import { useSanctum } from "../SanctumProvider";
import { useDesk } from "@/lib/desk/store";
import { SqPortrait, PresenceDot, presenceLabel } from "./SqPortrait";
import { lastActiveLabel, type LastActiveBucket } from "@/lib/desk/identity";
import { RADAR_PITCH } from "@/lib/ghosts/catalog";
import { pingNearestGhost } from "@/lib/desk/gps-ghost";
import {
  chimeEnabled,
  playSignOnChime,
  playReceiveChime,
  setChimeEnabled,
  offlineNoticeEnabled,
  setOfflineNoticeEnabled,
} from "@/lib/desk/chime";

type Person = {
  id: string;
  display_name: string;
  photo_data?: string | null;
  mood_text?: string | null;
  mood_at?: string | null;
  presence: string;
  city?: string | null;
  description?: string | null;
  last_seen?: string;
  last_active?: LastActiveBucket;
  location_text?: string;
  location_kind?: string;
  kind?: string;
  messaging?: boolean;
  removed?: boolean;
  blocked?: boolean;
};

type Incoming = {
  request_id: string;
  id: string;
  display_name: string;
  username?: string;
  photo_data?: string | null;
  kind?: string;
  source?: string;
  found_via?: string;
};

function isGhost(p: Person): boolean {
  return p.kind === "servant" || p.id.startsWith("ghost-");
}

function MailMark({ inbound, outbound }: { inbound?: boolean; outbound?: boolean }) {
  if (!inbound && !outbound) return null;
  return (
    <span
      title={inbound ? "New message" : "Message sent"}
      className={
        inbound
          ? "inline-block h-3 w-3 shrink-0 bg-signal"
          : "inline-block h-3 w-3 shrink-0 border-2 border-signal"
      }
      aria-hidden
    />
  );
}

export function ContactsSeat() {
  const { stealth, toggleStealth, profile, ready, firstRun } = useSanctum();
  const { openChat, openCard, open, windows, marks, setMark, peopleEpoch, bumpPeople } = useDesk();
  const [people, setPeople] = useState<Person[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [mine, setMine] = useState("online");
  const [chimeOn, setChimeOn] = useState(true);
  const [offNotice, setOffNotice] = useState(false);
  const [lookup, setLookup] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const [lookupHit, setLookupHit] = useState<{
    id: string;
    display_name: string;
    username?: string;
    photo_data?: string | null;
  } | null>(null);
  const seenOnline = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const seenUnread = useRef<Map<string, number>>(new Map());

  async function load() {
    const r = await listDeskPeople();
    setPeople((r.people as Person[]) ?? []);
    setIncoming((r.incoming as Incoming[]) ?? []);
    return (r.people as Person[]) ?? [];
  }

  useEffect(() => {
    setChimeOn(chimeEnabled());
    setOffNotice(offlineNoticeEnabled());
  }, []);

  useEffect(() => {
    if (!ready || firstRun) return;
    void load().then((list) => {
      if (!primed.current) {
        primed.current = true;
        for (const p of list) {
          if (p.presence === "online" && !isGhost(p)) {
            seenOnline.current.add(p.id);
            playSignOnChime();
          }
        }
      }
    });
    const t = setInterval(() => {
      void flushGhostPings().catch(() => {});
      void load().then((list) => {
        for (const p of list) {
          if (isGhost(p)) continue;
          if (p.presence === "online" && !seenOnline.current.has(p.id)) {
            seenOnline.current.add(p.id);
            playSignOnChime();
          }
          if (p.presence === "offline") seenOnline.current.delete(p.id);
        }
      });
      void listConversations().then((convos) => {
        const wins = useDesk.getState().windows;
        for (const c of convos as { other_user: { id: string }; unread_count: number; last_sender_id: string | null }[]) {
          const id = c.other_user.id;
          const prev = seenUnread.current.get(id) ?? 0;
          if (c.unread_count > prev) {
            const chatOpen = wins.some((w) => w.kind === "chat" && w.peerId === id && !w.minimized);
            if (!chatOpen) playReceiveChime();
            setMark(id, { inbound: true, unread: c.unread_count });
          } else if (c.last_sender_id && c.last_sender_id !== id) {
            setMark(id, { outbound: true });
          }
          seenUnread.current.set(id, c.unread_count);
        }
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [ready, firstRun, setMark]);

  useEffect(() => {
    if (!ready || firstRun || peopleEpoch === 0) return;
    void load();
  }, [peopleEpoch, ready, firstRun]);

  const humans = people.filter((p) => !isGhost(p) && !p.removed);
  const removed = people.filter((p) => !isGhost(p) && p.removed);
  const ghosts = people.filter((p) => isGhost(p) && !p.removed);
  const openIds = new Set(windows.filter((w) => w.kind === "chat" && w.peerId).map((w) => w.peerId));
  const groups: { label: string; test: (p: Person) => boolean }[] = [
    { label: "Open conversations", test: (p) => openIds.has(p.id) },
    { label: "Online", test: (p) => p.presence === "online" && !openIds.has(p.id) },
    { label: "Away", test: (p) => (p.presence === "away" || p.presence === "busy") && !openIds.has(p.id) },
    { label: "Offline", test: (p) => (p.presence === "offline" || p.presence === "invisible") && !openIds.has(p.id) },
  ];

  const locKind = profile?.gps_consent ? "device-reported" : "stated location";
  const locText = profile?.location_text || "";

  function PersonRow({ p, ghost }: { p: Person; ghost?: boolean }) {
    const mark = marks[p.id];
    return (
      <li>
        <div className="flex items-center gap-3 px-3 py-2 hover:bg-signal-fog">
          <button
            type="button"
            className="shrink-0"
            onClick={() => openCard(p.id, p.display_name)}
            aria-label={`${p.display_name} card`}
          >
            <SqPortrait src={p.photo_data} name={p.display_name} size="sm" />
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            data-open-chat={p.id}
            title="Open chat"
            aria-label={`Message ${p.display_name}`}
            onClick={() => openChat(p.id, p.display_name)}
          >
            <span className="flex items-center gap-2 font-medium">
              {!ghost && <PresenceDot presence={p.presence} />}
              <span>{p.display_name}</span>
              <MailMark inbound={mark?.inbound} outbound={mark?.outbound} />
            </span>
            <span className="block truncate text-sm text-muted">
              {ghost
                ? "Ghost · Not a person."
                : `${presenceLabel(p.presence)}${p.last_active ? ` · ${lastActiveLabel(p.last_active)}` : ""}${p.mood_text ? ` · ${p.mood_text}` : ""}`}
            </span>
          </button>
          {ghost ? (
            <button
              type="button"
              className="min-h-10 shrink-0 border border-border bg-paper px-2 text-xs"
              onClick={async () => {
                await removeFriend({ data: { friendId: p.id } });
                setPeople((prev) => prev.filter((x) => x.id !== p.id));
              }}
            >
              Delete
            </button>
          ) : p.removed ? (
            <span className="text-xs text-muted">Removed</span>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-paper-inset px-3 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="shrink-0"
            onClick={() => profile && openCard(profile.id, profile.display_name || "Unsigned")}
            aria-label="Your card"
          >
            <SqPortrait src={null} name={profile?.display_name || "Unsigned"} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{profile?.display_name || "Unsigned"}</p>
            {profile?.username_claimed && profile.username ? (
              <p className="truncate text-sm text-muted">@{profile.username}</p>
            ) : null}
            <label className="mt-1 flex items-center gap-2 text-sm text-muted">
              <PresenceDot presence={mine} />
              <select
                className="min-h-10 border border-border bg-paper px-2 text-ink"
                value={mine}
                onChange={(e) => {
                  const v = e.target.value as "online" | "away" | "busy" | "invisible" | "offline";
                  setMine(v);
                  void setMyPresence({ data: { presence: v } });
                }}
              >
                <option value="online">Online</option>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
                <option value="invisible">Invisible</option>
                <option value="offline">Offline</option>
              </select>
            </label>
            {locText ? (
              <p className="mt-1 truncate text-sm text-muted" title={locKind}>
                {locKind} · {locText}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              const turningRadarOn = stealth;
              await toggleStealth();
              if (turningRadarOn) {
                await pingNearestGhost({ announce: true });
              }
              void load();
            }}
            className="min-h-10 border border-border-strong bg-paper px-3 text-sm hover:bg-signal-fog"
            aria-pressed={stealth}
          >
            {stealth ? "Stealth on" : "Radar on"}
          </button>
          <button
            type="button"
            className="min-h-10 border border-border bg-paper px-3 text-sm"
            onClick={() => open({ id: "moods", kind: "moods", title: "Moods", x: 460, y: 40, w: 400, h: 520 })}
          >
            Moods
          </button>
        </div>
        {profile?.mood_text && (
          <p className="mt-2 text-sm italic text-ink-soft">{profile.mood_text}</p>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-border px-3 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Username lookup</h2>
          <p className="mt-1 text-xs text-muted">
            Type the exact username. There is no directory. Ghosts are not in this lookup.
          </p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const q = lookup.trim().replace(/^@/, "");
              if (!q) return;
              setLookupBusy(true);
              setLookupNotice(null);
              setLookupHit(null);
              try {
                const r = await lookupUsername({ data: { username: q } });
                if (r.hit) {
                  setLookupHit({
                    id: (r.hit as { id: string }).id,
                    display_name: (r.hit as { display_name: string }).display_name,
                    username: (r.hit as { username?: string }).username,
                    photo_data: (r.hit as { photo_data?: string | null }).photo_data,
                  });
                } else if (r.grave) {
                  setLookupNotice(`@${(r.grave as { username: string }).username} was laid down. No live seat.`);
                } else {
                  setLookupNotice("No seat with that username.");
                }
              } catch (err) {
                setLookupNotice(err instanceof Error ? err.message : "Lookup failed.");
              } finally {
                setLookupBusy(false);
              }
            }}
          >
            <input
              className="min-h-10 min-w-0 flex-1 border border-border bg-paper px-2 text-sm"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="Type the exact username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Exact username"
            />
            <button type="submit" disabled={lookupBusy} className="min-h-10 border border-border-strong bg-paper px-3 text-sm">
              Look up
            </button>
          </form>
          {lookupNotice && <p className="mt-2 text-sm text-muted">{lookupNotice}</p>}
          {lookupHit && (
            <div className="mt-2 flex items-center gap-2 border border-border bg-paper-elevated px-2 py-2">
              <SqPortrait src={lookupHit.photo_data} name={lookupHit.display_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{lookupHit.display_name}</p>
                {lookupHit.username ? <p className="truncate text-xs text-muted">@{lookupHit.username}</p> : null}
              </div>
              <button
                type="button"
                className="min-h-10 shrink-0 border border-border-strong bg-paper px-2 text-sm"
                onClick={() => openCard(lookupHit.id, lookupHit.display_name)}
              >
                Card
              </button>
              <button
                type="button"
                className="min-h-10 shrink-0 border border-border-strong bg-paper px-2 text-sm"
                onClick={async () => {
                  try {
                    await sendFriendRequest({ data: { toId: lookupHit.id, source: "username" } });
                    setLookupNotice(`Request sent to ${lookupHit.display_name}.`);
                    setLookupHit(null);
                    bumpPeople();
                    void load();
                  } catch (err) {
                    setLookupNotice(err instanceof Error ? err.message : "Could not send.");
                  }
                }}
              >
                Send request
              </button>
            </div>
          )}
        </section>
        {incoming.length > 0 && (
          <section className="border-b border-border">
            <h2 className="bg-titlebar px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Requests
            </h2>
            <ul>
              {incoming.map((r) => (
                <li key={r.request_id} className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <SqPortrait src={r.photo_data} name={r.display_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {r.display_name}
                      {r.username ? <span className="ml-1 text-sm font-normal text-muted">@{r.username}</span> : null}
                    </p>
                    <p className="truncate text-sm text-muted">{r.found_via || "Found you"}</p>
                    {r.source === "radar" && (
                      <p className="text-xs text-ink-soft">{RADAR_PITCH}</p>
                    )}
                    {r.kind === "servant" && <p className="text-xs text-muted">Ghost · Not a person.</p>}
                  </div>
                  <button
                    type="button"
                    className="min-h-10 shrink-0 border border-border-strong bg-paper px-2 text-sm"
                    onClick={async () => {
                      await acceptFriend({ data: { fromId: r.id } });
                      setIncoming((prev) => prev.filter((x) => x.id !== r.id));
                      bumpPeople();
                      void load();
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="min-h-10 shrink-0 border border-border bg-paper px-2 text-sm"
                    onClick={async () => {
                      await declineFriend({ data: { fromId: r.id } });
                      setIncoming((prev) => prev.filter((x) => x.id !== r.id));
                    }}
                  >
                    Decline
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {groups.map((g) => {
          const rows = humans.filter(g.test);
          if (rows.length === 0) return null;
          return (
            <section key={g.label} className="border-b border-border">
              <h2 className="bg-titlebar px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {g.label}
              </h2>
              <ul>
                {rows.map((p) => (
                  <PersonRow key={p.id} p={p} />
                ))}
              </ul>
            </section>
          );
        })}
        {humans.length === 0 && (
          <section className="border-b border-border px-3 py-4 text-sm text-ink-soft">
            <p>No contacts yet. Nobody is added for you.</p>
            <p className="mt-1">
              Turn Radar on to be found and to see who is near, or type an exact
              username above and send a request.
            </p>
          </section>
        )}
        {ghosts.length > 0 && (
          <section className="border-b border-border">
            <h2 className="bg-titlebar px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Ghosts
            </h2>
            <p className="px-3 py-1 text-xs text-muted">
              Not a person. A regional ghost finds you when GPS is on. Poles live in Network.
            </p>
            <ul>
              {ghosts.map((p) => (
                <PersonRow key={p.id} p={p} ghost />
              ))}
            </ul>
          </section>
        )}
        {removed.length > 0 && (
          <section className="border-b border-border">
            <h2 className="bg-titlebar px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Removed
            </h2>
            <p className="px-3 py-1 text-xs text-muted">Messaging is off. The composer greys. The edge remains.</p>
            <ul>
              {removed.map((p) => (
                <PersonRow key={p.id} p={p} />
              ))}
            </ul>
          </section>
        )}
        {humans.length === 0 && ghosts.length === 0 && incoming.length === 0 && (
          <p className="px-3 py-6 text-muted">No people on this seat yet.</p>
        )}
      </div>
      <footer className="shrink-0 space-y-2 border-t border-border bg-paper px-3 py-2 text-xs text-muted">
        <p>You can sign on, talk, and sign off. Nothing here needs you to stay.</p>
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="checkbox"
            checked={chimeOn}
            onChange={(e) => {
              setChimeOn(e.target.checked);
              setChimeEnabled(e.target.checked);
            }}
          />
          Sign-on chime
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="checkbox"
            checked={offNotice}
            onChange={(e) => {
              setOffNotice(e.target.checked);
              setOfflineNoticeEnabled(e.target.checked);
            }}
          />
          Quiet notice when a friend goes offline
        </label>
      </footer>
    </div>
  );
}
