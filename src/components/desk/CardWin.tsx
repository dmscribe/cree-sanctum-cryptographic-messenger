import { useEffect, useState } from "react";
import { getPublicKey } from "@/lib/server/profile";
import { formatFingerprint } from "@/lib/sanctum/pgp";
import { useDesk } from "@/lib/desk/store";
import { useSanctum } from "../SanctumProvider";
import { SqPortrait, PresenceDot, presenceLabel } from "./SqPortrait";
import { Button } from "../ui/button";
import { lastActiveLabel, type LastActiveBucket } from "@/lib/desk/identity";
import { RADAR_PITCH } from "@/lib/ghosts/catalog";
import { removeFriend, sendFriendRequest } from "@/lib/server/mailbox";
import { blockPerson } from "@/lib/server/radar";

export function CardWin({ peerId }: { peerId: string }) {
  const { openChat, close, bumpPeople } = useDesk();
  const { profile, activeSeatId } = useSanctum();
  const mine = peerId === activeSeatId || peerId === profile?.id;
  const [card, setCard] = useState<{
    display_name: string;
    photo_data?: string | null;
    description?: string;
    city?: string | null;
    mood_text?: string | null;
    openpgp_fingerprint?: string | null;
    presence?: string;
    last_active?: LastActiveBucket;
    location_kind?: string;
    location_text?: string;
    username?: string;
    username_claimed?: boolean;
    throwaway?: boolean;
    kind?: string;
    nearest_to_you?: boolean;
    is_friend?: boolean;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getPublicKey({ data: { userId: peerId } }).then((r) => {
      const u = r.user as typeof card;
      setCard(u);
    });
  }, [peerId]);

  const liveLoc =
    mine && profile
      ? {
          kind: profile.gps_consent ? "device" : profile.location_kind || "stated",
          text: profile.location_text || "",
        }
      : null;

  if (!card) return <p className="p-4 text-muted">Opening card…</p>;

  const locKind = liveLoc?.kind || card.location_kind || (card.city ? "stated" : "none");
  const locText = liveLoc?.text || card.location_text || card.city || "";
  const ghost = card.kind === "servant" || peerId.startsWith("ghost-");

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <SqPortrait src={card.photo_data} name={card.display_name} size="lg" />
        <div>
          <p className="font-medium text-xl">{card.display_name}</p>
          {ghost && <p className="text-sm text-muted">Ghost · Not a person.</p>}
          {card.nearest_to_you && (
            <p className="mt-1 text-sm font-medium text-signal">Nearest to you</p>
          )}
          {card.username_claimed && card.username && (
            <p className="text-sm text-muted">@{card.username}</p>
          )}
          {card.throwaway && (
            <p className="text-sm text-muted">Throwaway seat</p>
          )}
          {card.presence && (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <PresenceDot presence={card.presence} />
              {presenceLabel(card.presence)}
            </p>
          )}
          <p className="text-sm text-muted">{lastActiveLabel(card.last_active || "idle")}</p>
          {locText && (
            <p className="text-sm text-muted">
              {locKind === "device" ? "device-reported" : "stated location"} · {locText}
            </p>
          )}
        </div>
      </div>
      {!mine && (
        <div className="flex flex-col gap-2">
          {notice && <p className="text-sm text-ink-soft">{notice}</p>}
          {!ghost && !card.is_friend && (
            <Button
              onClick={async () => {
                try {
                  await sendFriendRequest({ data: { toId: peerId, source: "username" } });
                  setNotice("Request sent.");
                  bumpPeople();
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : "Could not send.");
                }
              }}
            >
              Send request
            </Button>
          )}
          <Button onClick={() => openChat(peerId, card.display_name)}>Open chat</Button>
          <div className="flex gap-2">
            {card.is_friend && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await removeFriend({ data: { friendId: peerId } });
                  bumpPeople();
                }}
              >
                Remove
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={async () => {
                await blockPerson({ data: { targetId: peerId } });
                bumpPeople();
                close(`card:${peerId}`);
                close(`chat:${peerId}`);
              }}
            >
              Block
            </Button>
          </div>
        </div>
      )}
      {card.nearest_to_you && (
        <p className="text-ink-soft">{RADAR_PITCH}</p>
      )}
      {card.mood_text && <p className="italic text-ink-soft">{card.mood_text}</p>}
      {card.description && <p className="text-ink-soft">{card.description}</p>}
      {card.openpgp_fingerprint && (
        <p className="font-mono text-sm leading-relaxed">
          {formatFingerprint(card.openpgp_fingerprint)}
        </p>
      )}
    </div>
  );
}
