import { useEffect, useState } from "react";
import { formatFingerprint } from "@/lib/sanctum/pgp";
import { loadTrust, saveTrust, type TrustRecord } from "@/lib/sanctum/vault";
import type { TrustState } from "@/lib/sanctum/protocol";
import { Button } from "./ui/button";

export function VerifyRitual({
  peerId,
  peerName,
  theirFingerprint,
  myFingerprint,
  onClose,
  onChanged,
}: {
  peerId: string;
  peerName: string;
  theirFingerprint: string | null;
  myFingerprint: string;
  onClose: () => void;
  onChanged?: (state: TrustState) => void;
}) {
  const [rec, setRec] = useState<TrustRecord | undefined>();

  useEffect(() => {
    void loadTrust(peerId).then(setRec);
  }, [peerId]);

  async function mark(state: TrustState) {
    if (!theirFingerprint) return;
    const next: TrustRecord = {
      peerId,
      fingerprint: theirFingerprint,
      bindingPayload: "",
      state,
      verifiedAt: new Date().toISOString(),
    };
    await saveTrust(next);
    setRec(next);
    onChanged?.(state);
  }

  const shown = theirFingerprint ? formatFingerprint(theirFingerprint) : "No identity published yet";

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-paper/80 p-4">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-xl bg-paper-elevated p-6 shadow-lg">
        <h2 className="text-2xl">Verify identity</h2>
        <p className="mt-3 text-ink-soft">
          Keys can be swapped by a server. Fingerprints cannot, if you check
          them with {peerName}.
        </p>
        <div className="mt-5 space-y-4">
          <div className="rounded-lg bg-paper-inset p-4">
            <p className="text-sm font-medium text-muted">Their fingerprint — read this aloud</p>
            <p className="mt-2 font-mono text-lg leading-relaxed tracking-wide">{shown}</p>
          </div>
          <div className="rounded-lg bg-paper-inset p-4">
            <p className="text-sm font-medium text-muted">Yours</p>
            <p className="mt-2 font-mono text-lg leading-relaxed tracking-wide">
              {formatFingerprint(myFingerprint)}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">
          Compare in person, on a call you already trust, or over a second
          channel. Do not trust a fingerprint the server shows you alone.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={() => void mark("verified")} disabled={!theirFingerprint}>
            Fingerprints match — mark verified
          </Button>
          <Button variant="danger" onClick={() => void mark("mismatch")} disabled={!theirFingerprint}>
            They do not match
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        {rec && (
          <p className="mt-3 text-sm text-muted">
            Local state: {rec.state}
            {rec.verifiedAt ? ` · ${new Date(rec.verifiedAt).toLocaleString()}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
