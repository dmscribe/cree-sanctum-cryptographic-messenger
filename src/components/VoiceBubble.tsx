import { useEffect, useState } from "react";
import { Clock, Download, Play } from "lucide-react";
import { decryptMessage } from "@/lib/sanctum/crypto";
import { b64ToBytes } from "@/lib/sanctum/crypto";
import { verifyBytes } from "@/lib/sanctum/pgp";
import { mailboxAad } from "@/lib/sanctum/protocol";
import type { SeatVault } from "@/lib/sanctum/vault";

const NOTICE =
  "This audio is encrypted while on the server. Once downloaded, it becomes a regular file on the device and is no longer protected by Sanctum.";

function timeLeft(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function VoiceBubble({
  message,
  mine,
  seat,
  senderPubHex,
}: {
  message: {
    id: string;
    sender_id: string;
    recipient_id: string;
    crypto_ver?: 1 | 2;
    expires_at?: string | null;
    audio_duration?: number | null;
    audio_ciphertext?: string | null;
    audio_nonce?: string | null;
    audio_eph_pub?: string | null;
    audio_ciphertext_self?: string | null;
    audio_nonce_self?: string | null;
    audio_eph_pub_self?: string | null;
  };
  mine: boolean;
  seat: SeatVault;
  senderPubHex?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sig, setSig] = useState<"ok" | "bad" | "unsigned" | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      clearInterval(iv);
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const remaining = timeLeft(message.expires_at);
  if (!remaining) {
    return <p className="text-sm italic opacity-70">[Voice message expired]</p>;
  }

  async function decryptAudio() {
    const payload = mine
      ? {
          ciphertext: message.audio_ciphertext_self || "",
          nonce: message.audio_nonce_self || "",
          eph_pub: message.audio_eph_pub_self || "",
          crypto_ver: message.crypto_ver,
        }
      : {
          ciphertext: message.audio_ciphertext || "",
          nonce: message.audio_nonce || "",
          eph_pub: message.audio_eph_pub || "",
          crypto_ver: message.crypto_ver,
        };
    const plain = await decryptMessage(
      seat.device.privateJwk,
      payload,
      message.crypto_ver === 2 ? mailboxAad(message.sender_id, message.recipient_id) : undefined,
    );
    const parsed = JSON.parse(plain) as { mime: string; data: string; pgp_sig?: string };
    const bytes = b64ToBytes(parsed.data);
    if (!parsed.pgp_sig) setSig("unsigned");
    else if (senderPubHex && verifyBytes(senderPubHex, bytes, parsed.pgp_sig)) setSig("ok");
    else if (parsed.pgp_sig) setSig("bad");
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Blob([copy], { type: parsed.mime || "audio/webm" });
  }

  async function play() {
    if (url || busy) return;
    setBusy(true);
    try {
      const b = await decryptAudio();
      setBlob(b);
      setUrl(URL.createObjectURL(b));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (
      !window.confirm(
        `This recording is only timestamped on your device. After 24 hours it can no longer be downloaded.\n\n${NOTICE}\n\nDownload this recording?`,
      )
    )
      return;
    try {
      const b = blob || (await decryptAudio());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `sanctum-voice-${message.id.slice(0, 8)}.webm`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.alert("Could not decrypt this recording on this device");
    }
  }

  if (failed) {
    return <p className="text-sm italic opacity-70">[Encrypted voice — cannot decrypt on this device]</p>;
  }

  return (
    <div className="min-w-[200px]">
      {url ? (
        <div>
          <audio src={url} controls autoPlay className="h-10 w-full max-w-[240px]" />
          <p className="mt-1 text-xs opacity-80">{NOTICE}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void play()}
          disabled={busy}
          className="flex min-h-11 items-center gap-2 text-base font-medium"
        >
          <Play className="h-5 w-5" />
          Voice message · {Math.round(message.audio_duration || 0)}s
        </button>
      )}
      {sig === "ok" && <p className="text-xs">Signed by their identity</p>}
      {sig === "bad" && <p className="text-xs text-signal">Not their identity</p>}
      {sig === "unsigned" && <p className="text-xs opacity-70">unsigned</p>}
      <div className="mt-1 flex items-center gap-3 text-xs opacity-80">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> expires in {remaining}
        </span>
        <button type="button" onClick={() => void download()} className="flex items-center gap-1 underline">
          <Download className="h-3.5 w-3.5" /> download
        </button>
      </div>
    </div>
  );
}
