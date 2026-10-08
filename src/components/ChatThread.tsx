import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, LockKeyhole, Send, ShieldAlert } from "lucide-react";
import {
  canMessage,
  deleteMessage,
  getThreadWith,
  markRead,
  peerActivity,
  precheck,
  pulseTyping,
  sendMessage,
} from "@/lib/server/mailbox";
import { getPublicKey } from "@/lib/server/profile";
import { encryptFor, decryptMessage, bytesToB64 } from "@/lib/sanctum/crypto";
import { signBytes, verifyBinding, verifyBytes, parseArmoredPublic } from "@/lib/sanctum/pgp";
import { loadTrust } from "@/lib/sanctum/vault";
import { mailboxAad } from "@/lib/sanctum/protocol";
import type { InnerPlaintext, SanctumPublicJwk, TrustState } from "@/lib/sanctum/protocol";
import { useSanctum } from "./SanctumProvider";
import { Portrait } from "./Portrait";
import { SqPortrait } from "./desk/SqPortrait";
import { VoiceRecorder } from "./VoiceRecorder";
import { VoiceBubble } from "./VoiceBubble";
import { VerifyRitual } from "./VerifyRitual";
import { downloadBlob } from "@/lib/sanctum/session";
import { seatLabel } from "@/lib/desk/identity";
import { playReceiveChime } from "@/lib/desk/chime";
import { useDesk } from "@/lib/desk/store";
import { EmotePicker, MessageBody, emoteToken, isEmoteToken, type EmoteId } from "./Emotes";
import { MediaBubble } from "./MediaBubble";

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  message_type: string;
  crypto_ver?: 1 | 2;
  created_at: string;
  read_at?: string | null;
  expires_at?: string | null;
  ciphertext: string;
  nonce: string;
  eph_pub: string;
  ciphertext_self: string;
  nonce_self: string;
  eph_pub_self: string;
  audio_ciphertext?: string | null;
  audio_nonce?: string | null;
  audio_eph_pub?: string | null;
  audio_ciphertext_self?: string | null;
  audio_nonce_self?: string | null;
  audio_eph_pub_self?: string | null;
  audio_duration?: number | null;
};

async function stillToJpeg(file: File): Promise<{ mime: string; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((res, rej) => {
      image.onload = () => res();
      image.onerror = () => rej(new Error("Could not read that picture."));
      image.src = url;
    });
    const max = 960;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not draw that picture.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    const data = dataUrl.split(",")[1] || "";
    return { mime: "image/jpeg", data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ChatThread({ peerId, embedded = false }: { peerId: string; embedded?: boolean }) {
  const { activeSeat, activeSeatId, profile } = useSanctum();
  const setMark = useDesk((s) => s.setMark);
  const peopleEpoch = useDesk((s) => s.peopleEpoch);
  const [warnMin, setWarnMin] = useState(true);
  const [peer, setPeer] = useState<{
    display_name: string;
    photo_data?: string | null;
    openpgp_fingerprint?: string | null;
    kind?: string;
  } | null>(null);
  const [pub, setPub] = useState<SanctumPublicJwk | null>(null);
  const [pgp, setPgp] = useState<{
    fingerprint: string | null;
    armored: string | null;
    payload: string | null;
    signature: string | null;
    pubHex: string | null;
  } | null>(null);
  const [gate, setGate] = useState<{ allowed: boolean; reason: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [plain, setPlain] = useState<Record<string, { text: string; sig: "ok" | "bad" | "unsigned" | "legacy" }>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  const [trust, setTrust] = useState<TrustState>("unverified");
  const [showVerify, setShowVerify] = useState(false);
  const [fullLinks, setFullLinks] = useState(false);
  const [peerAct, setPeerAct] = useState<string | null>(null);
  const [receipts, setReceipts] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(`sanctum-receipts:${peerId}`) !== "off";
  });
  const bottom = useRef<HTMLDivElement>(null);
  const primedIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const lastPulse = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const asSeat = activeSeatId;
  const receiveOn = profile?.receive_media !== false;

  const checkBinding = useCallback(
    (
      jwk: SanctumPublicJwk | null,
      info: { armored: string | null; payload: string | null; signature: string | null } | null,
    ) => {
      if (!jwk || !info?.armored || !info.payload || !info.signature) {
        setBindError(null);
        return true;
      }
      const res = verifyBinding({
        armored: info.armored,
        payload: info.payload,
        signature: info.signature,
        expectedJwk: jwk,
        expectedUserId: peerId,
      });
      if (!res.ok) {
        setBindError(res.reason || "Identity binding failed. Do not send.");
        return false;
      }
      setBindError(null);
      return true;
    },
    [peerId],
  );

  const load = useCallback(async () => {
    if (!activeSeat) return;
    try {
      const [keyRes, gateRes, thread] = await Promise.all([
        getPublicKey({ data: { userId: peerId } }),
        canMessage({ data: { userId: peerId, asSeatId: asSeat } }),
        getThreadWith({ data: { otherId: peerId, asSeatId: asSeat } }),
      ]);
      setPub(keyRes.sanctum_public_key);
      const parsed = keyRes.openpgp_public_key ? parseArmoredPublic(keyRes.openpgp_public_key) : null;
      const info = {
        fingerprint: keyRes.openpgp_fingerprint,
        armored: keyRes.openpgp_public_key,
        payload: keyRes.device_binding_payload,
        signature: keyRes.device_binding_signature,
        pubHex: parsed?.publicKeyHex ?? null,
      };
      setPgp(info);
      setPeer(keyRes.user as typeof peer);
      setGate(gateRes);
      checkBinding(keyRes.sanctum_public_key, info);
      const rec = await loadTrust(peerId);
      if (
        rec &&
        keyRes.openpgp_fingerprint &&
        rec.fingerprint !== keyRes.openpgp_fingerprint &&
        rec.state === "verified"
      ) {
        setTrust("mismatch");
      } else {
        setTrust(rec?.state ?? "unverified");
      }
      const list = thread.messages as Msg[];
      if (primed.current) {
        let inbound = false;
        for (const m of list) {
          if (!primedIds.current.has(m.id) && m.sender_id !== asSeat) {
            playReceiveChime();
            inbound = true;
          }
        }
        if (inbound) setMark(peerId, { inbound: true });
      }
      for (const m of list) primedIds.current.add(m.id);
      primed.current = true;
      setMessages(list);
      const decoded: Record<string, { text: string; sig: "ok" | "bad" | "unsigned" | "legacy" }> = {};
      for (const m of list) {
        if (m.message_type === "voice" || m.message_type === "image" || m.message_type === "video") continue;
        try {
          const mine = m.sender_id === asSeat;
          const packet = mine
            ? { ciphertext: m.ciphertext_self, nonce: m.nonce_self, eph_pub: m.eph_pub_self, crypto_ver: m.crypto_ver }
            : { ciphertext: m.ciphertext, nonce: m.nonce, eph_pub: m.eph_pub, crypto_ver: m.crypto_ver };
          const raw = await decryptMessage(activeSeat.device.privateJwk, packet, m.crypto_ver === 2 ? mailboxAad(asSeat, peerId) : undefined);
          const obj = JSON.parse(raw) as InnerPlaintext;
          let sig: "ok" | "bad" | "unsigned" | "legacy" = "legacy";
          if (!obj.pgp_sig) sig = parsed ? "unsigned" : "legacy";
          else if (info.pubHex && verifyBytes(info.pubHex, obj.text, obj.pgp_sig)) sig = "ok";
          else if (mine) sig = "ok";
          else sig = "bad";
          decoded[m.id] = { text: obj.text, sig };
        } catch {
          decoded[m.id] = { text: "", sig: "legacy" };
        }
      }
      setPlain(decoded);
      for (const m of list) {
        if (m.recipient_id === asSeat && !m.read_at && receipts) {
          void markRead({ data: { messageId: m.id, asSeatId: asSeat } });
        }
      }
    } catch {
      /* keep the last good thread */
    }
  }, [activeSeat, asSeat, peerId, checkBinding, receipts, setMark]);

  useEffect(() => {
    primed.current = false;
    primedIds.current = new Set();
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (peopleEpoch === 0) return;
    void load();
  }, [peopleEpoch, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const t = setInterval(() => {
      void peerActivity({ data: { peerId } })
        .then((r) => setPeerAct(r.kind))
        .catch(() => setPeerAct(null));
    }, 2000);
    return () => clearInterval(t);
  }, [peerId]);

  function pulse(kind: "text" | "voice") {
    const now = Date.now();
    if (now - lastPulse.current < 1200) return;
    lastPulse.current = now;
    void pulseTyping({ data: { peerId, kind } }).catch(() => {});
  }

  const blockedSend = Boolean(bindError) || trust === "mismatch" || Boolean(gate && !gate.allowed);
  const greyComposer = Boolean(gate && (gate.reason === "removed" || gate.reason === "blocked"));

  async function sendInner(trimmed: string) {
    if (!trimmed || sending || !pub || !activeSeat) return;
    if (trust === "mismatch") return;
    if (!checkBinding(pub, pgp)) return;
    setSending(true);
    try {
      const pre = await precheck({ data: { recipient_id: peerId, asSeatId: asSeat, text: trimmed } });
      if (!pre.allowed) {
        if (pre.links?.find((l: { allowed: boolean }) => !l.allowed) && !fullLinks) {
          window.alert("A link was blocked. Conservative links are on. Turn on Full Links in Identity if you mean it.");
          return;
        }
        window.alert(`Cannot send: ${pre.gate?.reason ?? "blocked"}`);
        return;
      }
      const pgp_sig = signBytes(activeSeat.identity.secretKeyHex, trimmed);
      const inner = JSON.stringify({ text: trimmed, pgp_sig });
      const [forThem, forSelf] = await Promise.all([
        encryptFor(pub, inner, mailboxAad(asSeat, peerId)),
        encryptFor(activeSeat.device.publicJwk, inner, mailboxAad(asSeat, peerId)),
      ]);
      const { crypto_ver: _forThemVer, ...forThemSend } = forThem;
      const { crypto_ver: _forSelfVer, ...forSelfSend } = forSelf;
      const res = (await sendMessage({
        data: {
          recipient_id: peerId,
          asSeatId: asSeat,
          ...forThemSend,
          ciphertext_self: forSelfSend.ciphertext,
          nonce_self: forSelfSend.nonce,
          eph_pub_self: forSelfSend.eph_pub,
          media_refs: [],
          read_receipt: true,
          message_type: "text",
          crypto_ver: 2 as const,
        },
      })) as Msg & { echo?: Msg | null };
      primedIds.current.add(res.id);
      setMessages((prev) => (prev.some((x) => x.id === res.id) ? prev : [...prev, res as Msg]));
      setPlain((p) => ({ ...p, [res.id]: { text: trimmed, sig: "ok" } }));
      setText("");
      setMark(peerId, { outbound: true });
      const echo = (res as { echo?: Msg }).echo;
      if (echo?.id && new Date(echo.created_at).getTime() <= Date.now() + 250) {
        primedIds.current.add(echo.id);
        setMessages((prev) => (prev.some((x) => x.id === echo.id) ? prev : [...prev, echo]));
      }
      if (peerId.startsWith("ghost-")) window.setTimeout(() => void load(), 250);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function sendText() {
    await sendInner(text.trim());
  }

  async function sendEmote(id: EmoteId) {
    await sendInner(emoteToken(id));
  }

  async function sendVoice(audioPayload: string, duration: number, raw: Uint8Array) {
    if (!pub || sending || !activeSeat) return;
    if (trust === "mismatch" || !checkBinding(pub, pgp)) return;
    setSending(true);
    try {
      const pre = await precheck({ data: { recipient_id: peerId, asSeatId: asSeat, text: "" } });
      if (!pre.allowed) {
        window.alert(`Cannot send: ${pre.gate?.reason ?? "blocked"}`);
        return;
      }
      const audioObj = JSON.parse(audioPayload) as Record<string, unknown>;
      const signedAudio = JSON.stringify({
        ...audioObj,
        pgp_sig: signBytes(activeSeat.identity.secretKeyHex, raw),
      });
      const meta = JSON.stringify({
        text: "[voice message]",
        voice: true,
        pgp_sig: signBytes(activeSeat.identity.secretKeyHex, "[voice message]"),
      });
      const [metaR, metaS, audioR, audioS] = await Promise.all([
        encryptFor(pub, meta, mailboxAad(asSeat, peerId)),
        encryptFor(activeSeat.device.publicJwk, meta, mailboxAad(asSeat, peerId)),
        encryptFor(pub, signedAudio, mailboxAad(asSeat, peerId)),
        encryptFor(activeSeat.device.publicJwk, signedAudio, mailboxAad(asSeat, peerId)),
      ]);
      const { crypto_ver: _metaVer, ...metaSend } = metaR;
      const { crypto_ver: _metaSelfVer, ...metaSelfSend } = metaS;
      const res = (await sendMessage({
        data: {
          recipient_id: peerId,
          asSeatId: asSeat,
          message_type: "voice",
          ...metaSend,
          crypto_ver: 2 as const,
          ciphertext_self: metaSelfSend.ciphertext,
          nonce_self: metaSelfSend.nonce,
          eph_pub_self: metaSelfSend.eph_pub,
          audio_ciphertext: audioR.ciphertext,
          audio_nonce: audioR.nonce,
          audio_eph_pub: audioR.eph_pub,
          audio_ciphertext_self: audioS.ciphertext,
          audio_nonce_self: audioS.nonce,
          audio_eph_pub_self: audioS.eph_pub,
          audio_duration: duration,
          media_refs: [],
          read_receipt: true,
        },
      })) as Msg;
      primedIds.current.add(res.id);
      setMessages((prev) => (prev.some((x) => x.id === res.id) ? prev : [...prev, res as Msg]));
      setMark(peerId, { outbound: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to send voice");
    } finally {
      setSending(false);
    }
  }

  async function sendMedia(file: File) {
    if (!pub || sending || !activeSeat) return;
    if (trust === "mismatch" || !checkBinding(pub, pgp)) return;
    const name = file.name.toLowerCase();
    if (file.type === "image/svg+xml" || name.endsWith(".svg")) {
      window.alert("SVG is not allowed.");
      return;
    }
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      window.alert("Pictures and video only. No general file drop.");
      return;
    }
    setSending(true);
    try {
      let payload: { mime: string; data: string };
      let type: "image" | "video";
      if (isImage) {
        payload = await stillToJpeg(file);
        type = "image";
      } else {
        if (!/video\/(webm|mp4)/.test(file.type)) {
          window.alert("Video must be webm or mp4.");
          return;
        }
        const buf = new Uint8Array(await file.arrayBuffer());
        if (buf.byteLength > 1_200_000) {
          window.alert("Video is too large for this desk.");
          return;
        }
        payload = { mime: file.type, data: bytesToB64(buf) };
        type = "video";
      }
      const label = type === "image" ? "[picture]" : "[video]";
      const signedMedia = JSON.stringify({
        ...payload,
        pgp_sig: signBytes(activeSeat.identity.secretKeyHex, payload.data),
      });
      const meta = JSON.stringify({
        text: label,
        pgp_sig: signBytes(activeSeat.identity.secretKeyHex, label),
      });
      const [metaR, metaS, mediaR, mediaS] = await Promise.all([
        encryptFor(pub, meta, mailboxAad(asSeat, peerId)),
        encryptFor(activeSeat.device.publicJwk, meta, mailboxAad(asSeat, peerId)),
        encryptFor(pub, signedMedia, mailboxAad(asSeat, peerId)),
        encryptFor(activeSeat.device.publicJwk, signedMedia, mailboxAad(asSeat, peerId)),
      ]);
      const { crypto_ver: _metaVer2, ...metaSend2 } = metaR;
      const { crypto_ver: _metaSelfVer2, ...metaSelfSend2 } = metaS;
      const { crypto_ver: _mediaVer, ...mediaSend } = mediaR;
      const { crypto_ver: _mediaSelfVer, ...mediaSelfSend } = mediaS;
      const res = (await sendMessage({
        data: {
          recipient_id: peerId,
          asSeatId: asSeat,
          message_type: type,
          ...metaR,
          crypto_ver: 2 as const,
          ciphertext_self: metaS.ciphertext,
          nonce_self: metaS.nonce,
          eph_pub_self: metaS.eph_pub,
          audio_ciphertext: mediaR.ciphertext,
          audio_nonce: mediaR.nonce,
          audio_eph_pub: mediaR.eph_pub,
          audio_ciphertext_self: mediaS.ciphertext,
          audio_nonce_self: mediaS.nonce,
          audio_eph_pub_self: mediaS.eph_pub,
          media_refs: [],
          read_receipt: true,
        },
      })) as Msg;
      primedIds.current.add(res.id);
      setMessages((prev) => (prev.some((x) => x.id === res.id) ? prev : [...prev, res as Msg]));
      setMark(peerId, { outbound: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to send picture");
    } finally {
      setSending(false);
    }
  }

  if (!activeSeat) return <p>Loading seat…</p>;

  const ghost = peer?.kind === "servant" || peerId.startsWith("ghost-");
  const inboundMedia = messages.some(
    (m) => (m.message_type === "image" || m.message_type === "video") && m.sender_id !== asSeat,
  );
  const footer =
    peerAct === "voice"
      ? `${seatLabel(peer?.display_name)} is recording a voice message`
      : peerAct === "text"
        ? `${seatLabel(peer?.display_name)} is writing text`
        : null;

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col" : "mx-auto flex min-h-[70dvh] max-w-xl flex-col"}>
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {!embedded && (
            <Link to="/" className="grid h-12 w-12 place-items-center hover:bg-paper-inset">
              <ArrowLeft />
            </Link>
          )}
          {ghost ? (
            <Portrait src={peer?.photo_data} name={peer?.display_name || "Ghost"} servant />
          ) : (
            <SqPortrait src={peer?.photo_data} name={peer?.display_name || "Friend"} />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{peer ? seatLabel(peer.display_name) : "Encrypted room"}</p>
            <button
              type="button"
              onClick={() => setShowVerify(true)}
              className="flex items-center gap-1 text-sm text-muted"
            >
              <LockKeyhole className="h-4 w-4 text-signal" />
              {trust === "verified" && "Verified · compare again"}
              {trust === "unverified" && "Unverified · compare fingerprints"}
              {trust === "mismatch" && "Mismatch — do not send"}
              {trust === "new_device" && "New device for the same identity"}
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={receipts}
              onChange={(e) => {
                setReceipts(e.target.checked);
                try {
                  window.localStorage.setItem(`sanctum-receipts:${peerId}`, e.target.checked ? "on" : "off");
                } catch {
                  /* */
                }
              }}
            />
            Read receipts
          </label>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => {
              if (
                !window.confirm(
                  "Download chat writes a plaintext text file on this device. Continue?",
                )
              ) {
                return;
              }
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              const exported = new Date().toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "long",
              });
              const lines = [
                "Cree Sanctum chat export",
                `Exported: ${exported} (${tz})`,
                `Peer: ${seatLabel(peer?.display_name)}`,
                "WARNING: This file is no longer encrypted.",
                "",
              ];
              for (const m of messages) {
                const when = new Date(m.created_at).toLocaleString();
                const who = m.sender_id === asSeat ? "You" : seatLabel(peer?.display_name);
                let body = "[undecryptable on this device]";
                if (m.message_type === "voice") body = "[voice message]";
                else if (m.message_type === "image") body = "[picture]";
                else if (m.message_type === "video") body = "[video]";
                else if (plain[m.id]?.text) {
                  const em = isEmoteToken(plain[m.id].text);
                  body = em ? `[emote:${em}]` : plain[m.id].text;
                }
                lines.push(`[${when}] ${who}: ${body}`);
              }
              downloadBlob(
                `cree-sanctum-chat-${(peer?.display_name || "room").replace(/\s+/g, "-")}.txt`,
                lines.join("\n"),
                "text/plain",
              );
            }}
          >
            Download chat
          </button>
        </div>
      </div>

      {ghost && (
        <div className="mx-3 mb-3 border border-signal/40 bg-signal-fog px-4 py-3 text-sm">
          Ghost. Not a person. Ordinary text or voice is mirrored after five
          seconds. A line that starts with || arms a notification ping: close
          this room, wait 15 to 30 seconds, and the ghost writes back so you can
          hear the mark and the receive chime.
        </div>
      )}

      {warnMin ? (
        <div className="mx-3 mb-2 flex items-center justify-between border border-warn bg-warn-fog px-3 py-1 text-xs text-ink">
          <span>Opening warning hidden</span>
          <button
            type="button"
            className="underline"
            onClick={() => {
              setWarnMin(false);
              try {
                window.localStorage.removeItem(`sanctum-warn:${peerId}`);
              } catch {
                /* */
              }
            }}
          >
            Show warning
          </button>
        </div>
      ) : (
        <div className="mx-3 mb-3 border border-warn bg-warn-fog px-3 py-3 text-sm text-ink">
          <p>
            Be sure you know who you are talking to. Confirm keys at all times. Note
            that the other user can still download the chat history, and our system
            will timestamp that export in the local time zone. The server knows who
            you are talking to; the server cannot see what you are saying.
          </p>
          <button
            type="button"
            className="mt-2 text-xs underline"
            onClick={() => {
              setWarnMin(true);
              try {
                window.localStorage.setItem(`sanctum-warn:${peerId}`, "min");
              } catch {
                /* */
              }
            }}
          >
            Hide warning
          </button>
        </div>
      )}

      {gate && !gate.allowed && (
        <div className="mx-3 mb-4 border border-warn bg-warn-fog p-4 text-sm">
          {gate.reason === "not_mutual" && "You can only message friends. Add each other first."}
          {gate.reason === "history_off" && "Your chat history is off."}
          {gate.reason === "recipient_history_off" && "This person has messaging disabled."}
          {gate.reason === "recipient_no_key" && "They have not published a device key yet."}
          {gate.reason === "self" && "You cannot message this seat."}
          {gate.reason === "user_not_found" && "Person not found."}
          {gate.reason === "removed" && "You removed this person. Messaging is off."}
          {gate.reason === "blocked" && "This person is blocked."}
        </div>
      )}

      {bindError && (
        <div className="mx-3 mb-4 flex gap-2 border border-danger bg-danger-fog p-4 text-sm text-ink">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          {bindError}
        </div>
      )}

      {trust === "mismatch" && (
        <div className="mx-3 mb-4 border border-danger bg-danger-fog p-4 text-sm">
          Their fingerprint or device binding changed since you verified. Do not
          send until you compare again.
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3">
        {messages.map((m) => {
          const mine = m.sender_id === asSeat;
          const body = plain[m.id];
          const isVoice = m.message_type === "voice";
          const isMedia = m.message_type === "image" || m.message_type === "video";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] px-4 py-2 ${
                  mine ? "bg-signal text-paper" : "border border-border bg-paper-elevated"
                }`}
              >
                {isVoice ? (
                  <VoiceBubble message={m} mine={mine} seat={activeSeat} senderPubHex={pgp?.pubHex} />
                ) : isMedia ? (
                  receiveOn || mine ? (
                    <MediaBubble message={m} mine={mine} seat={activeSeat} receiveOn={receiveOn} />
                  ) : (
                    <p className="text-sm italic opacity-70">Picture refused (receiving is off).</p>
                  )
                ) : body && body.text ? (
                  <MessageBody text={body.text} />
                ) : body && body.text === "" ? (
                  <p className="italic opacity-70">[Encrypted — cannot decrypt on this device]</p>
                ) : (
                  <p className="italic opacity-70">Decrypting…</p>
                )}
                {body?.sig === "ok" && !isVoice && !isMedia && <p className="mt-1 text-xs opacity-70">Signed</p>}
                {m.sender_id.startsWith("ghost-") && (
                  <p className="mt-1 text-xs opacity-70">Mirrored · ghost</p>
                )}
                {body?.sig === "bad" && <p className="mt-1 text-xs">Not their identity</p>}
                {body?.sig === "unsigned" && <p className="mt-1 text-xs opacity-70">unsigned</p>}
                <div className="mt-1 flex items-center gap-2 text-xs opacity-70">
                  <span>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {mine && m.read_at ? " · Read" : ""}
                  </span>
                  {mine && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        void deleteMessage({ data: { messageId: m.id, asSeatId: asSeat } });
                        setMessages((prev) => prev.filter((x) => x.id !== m.id));
                      }}
                    >
                      delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {footer && <p className="px-3 py-1 text-sm italic text-muted">{footer}</p>}

      {greyComposer && (
        <div className="relative mt-2 shrink-0 border-t border-border bg-paper-inset p-3 opacity-50">
          <p className="mb-2 text-xs text-muted">
            {gate?.reason === "blocked" ? "Blocked. Messaging is off." : "Removed. Messaging is off."}
          </p>
          <textarea
            disabled
            rows={1}
            placeholder="Messaging disabled"
            className="min-h-12 w-full resize-none bg-transparent py-3 text-muted outline-none"
          />
        </div>
      )}

      {!blockedSend && (
        <div className="relative mt-2 shrink-0 border-t border-border bg-paper-elevated p-3">
          {inboundMedia && (
            <p className="mb-2 text-xs text-muted">
              Unsolicited pictures were a social-media plague. Stills stay black
              until the other person taps Open. This path is hardened; it can still
              be abused. Turn receiving off in Identity.
            </p>
          )}
          <EmotePicker onPick={(id) => void sendEmote(id)} />
          <div className="mt-2 flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/webm,video/mp4"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void sendMedia(f);
              }}
            />
            <button
              type="button"
              title="Picture or video only"
              className="grid h-12 w-12 place-items-center text-muted hover:bg-paper-inset"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <VoiceRecorder
              disabled={sending}
              onSend={sendVoice}
              onRecordingChange={(on) => {
                if (on) pulse("voice");
              }}
            />
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim()) pulse("text");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendText();
                }
              }}
              rows={1}
              placeholder="Encrypted message…"
              className="min-h-12 flex-1 resize-none bg-transparent py-3 outline-none"
            />
            <button
              type="button"
              onClick={() => void sendText()}
              disabled={sending}
              className="grid h-12 w-12 place-items-center bg-signal text-paper disabled:opacity-40"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Encrypted on this device. Conservative links{fullLinks ? " overridden" : " on"}.{" "}
            <button type="button" className="underline" onClick={() => setFullLinks((v) => !v)}>
              {fullLinks ? "Use conservative links" : "Full links allowed (warned)"}
            </button>
          </p>
        </div>
      )}

      {showVerify && (
        <VerifyRitual
          peerId={peerId}
          peerName={peer?.display_name || "them"}
          theirFingerprint={pgp?.fingerprint ?? null}
          myFingerprint={activeSeat.identity.fingerprint}
          onClose={() => setShowVerify(false)}
          onChanged={setTrust}
        />
      )}
    </div>
  );
}
