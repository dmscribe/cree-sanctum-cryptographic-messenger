import { useEffect, useRef, useState } from "react";
import { Mic, Send, X } from "lucide-react";
import { MAX_VOICE_DURATION_SECONDS } from "@/lib/sanctum/protocol";
import { bytesToB64 } from "@/lib/sanctum/crypto";

export function VoiceRecorder({
  disabled,
  onSend,
  onRecordingChange,
}: {
  disabled?: boolean;
  onSend: (payload: string, duration: number, raw: Uint8Array) => Promise<void>;
  onRecordingChange?: (on: boolean) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const secondsRef = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    if (timer.current) window.clearInterval(timer.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
    recRef.current?.stream?.getTracks().forEach((t) => t.stop());
    onRecordingChange?.(false);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        onRecordingChange?.(false);
        if (cancelled.current) return;
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 200) return;
        setBusy(true);
        try {
          const buf = new Uint8Array(await blob.arrayBuffer());
          await onSend(JSON.stringify({ mime: blob.type, data: bytesToB64(buf) }), secondsRef.current || 1, buf);
        } finally {
          setBusy(false);
        }
      };
      rec.start();
      recRef.current = rec;
      setSeconds(0);
      secondsRef.current = 0;
      setRecording(true);
      onRecordingChange?.(true);
      timer.current = window.setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          secondsRef.current = next;
          if (next >= MAX_VOICE_DURATION_SECONDS) finish();
          return next;
        });
      }, 1000);
    } catch {
      window.alert("Microphone access denied");
    }
  }

  function finish() {
    if (timer.current) window.clearInterval(timer.current);
    setRecording(false);
    if (recRef.current?.state === "recording") recRef.current.stop();
  }

  function cancel() {
    cancelled.current = true;
    finish();
  }

  if (!recording) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled || busy}
        title="Record a voice note (deleted after 24 hours). Mute mic on the taskbar does not block this."
        className="grid h-12 w-12 place-items-center text-signal hover:bg-signal-fog disabled:opacity-40"
      >
        <Mic className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 border border-border bg-paper-elevated p-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="h-3 w-3 shrink-0 bg-danger" />
        <span className="font-mono text-danger">
          {String(Math.floor(seconds / 60)).padStart(1, "0")}:{String(seconds % 60).padStart(2, "0")} / 1:30
        </span>
        <div className="flex-1" />
        <button type="button" onClick={cancel} className="grid h-12 w-12 place-items-center">
          <X />
        </button>
        <button
          type="button"
          onClick={finish}
          className="grid h-12 w-12 place-items-center bg-signal text-paper"
        >
          <Send />
        </button>
      </div>
      <p className="text-sm font-medium text-warn">
        This recording will be permanently deleted in 24 hours. It is not saved
        on the network.
      </p>
      <p className="mt-1 text-sm text-muted">
        Encrypted on this device. Only their key can open it. Check fingerprints
        if the story is confidential.
      </p>
    </div>
  );
}
