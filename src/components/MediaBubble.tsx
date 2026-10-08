import { useEffect, useState } from "react";
import { decryptMessage, b64ToBytes } from "@/lib/sanctum/crypto";
import { mailboxAad } from "@/lib/sanctum/protocol";
import type { SeatVault } from "@/lib/sanctum/vault";

export function MediaBubble({
  message,
  mine,
  seat,
  receiveOn,
}: {
  message: {
    id: string;
    sender_id: string;
    recipient_id: string;
    message_type: string;
    crypto_ver?: 1 | 2;
    audio_ciphertext?: string | null;
    audio_nonce?: string | null;
    audio_eph_pub?: string | null;
    audio_ciphertext_self?: string | null;
    audio_nonce_self?: string | null;
    audio_eph_pub_self?: string | null;
  };
  mine: boolean;
  seat: SeatVault;
  receiveOn: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<"image" | "video">(message.message_type === "video" ? "video" : "image");
  const [err, setErr] = useState<string | null>(null);
  const isVideo = kind === "video";

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function decrypt() {
    if (!receiveOn && !mine) {
      setErr("Pictures and video are turned off in Identity.");
      return;
    }
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
    try {
      const plain = await decryptMessage(
        seat.device.privateJwk,
        payload,
        message.crypto_ver === 2 ? mailboxAad(message.sender_id, message.recipient_id) : undefined,
      );
      const parsed = JSON.parse(plain) as { mime: string; data: string };
      if (!parsed.data || /svg/i.test(parsed.mime || "")) {
        setErr("This picture was refused.");
        return;
      }
      const bytes = b64ToBytes(parsed.data);
      const type = parsed.mime || (message.message_type === "video" ? "video/webm" : "image/jpeg");
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type });
      const next = URL.createObjectURL(blob);
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return next;
      });
      setKind(type.startsWith("video/") ? "video" : "image");
      setOpened(true);
    } catch {
      setErr("Could not open this on this device.");
    }
  }

  if (err) return <p className="text-sm italic opacity-70">{err}</p>;

  if (!opened || !url) {
    return (
      <button
        type="button"
        onClick={() => void decrypt()}
        className="grid h-36 w-48 place-items-center bg-black text-sm text-paper"
      >
        {message.message_type === "video" ? "Open video" : "Open picture"}
      </button>
    );
  }

  if (isVideo) {
    return <video src={url} controls playsInline className="max-h-64 max-w-full bg-black" preload="metadata" />;
  }

  return <img src={url} alt="" className="max-h-64 max-w-full" draggable={false} />;
}
