import { useEffect, useState } from "react";
import { formatFingerprint, wrapSecretBackup } from "@/lib/sanctum/pgp";
import { generateDeviceKey } from "@/lib/sanctum/crypto";
import { saveSeat, getMeta, setMeta } from "@/lib/sanctum/vault";
import { republishSeat, downloadBlob } from "@/lib/sanctum/session";
import { setMood, updateSafety, updateProfileFields, claimUsername, deleteMyAccount } from "@/lib/server/profile";
import { useSanctum } from "./SanctumProvider";
import { Button } from "./ui/button";
import { Input, Textarea } from "./ui/input";
import { sha256Hex } from "@/lib/sanctum/crypto";
import { signOut } from "@/lib/auth/client";
import {
  seatLabel,
  composeOperatorUsername,
  operatorDigits,
  mintOperatorUsername,
  matchesExportConfirmation,
} from "@/lib/desk/identity";
import { OperatorHandleInput } from "./OperatorHandleInput";

async function wipeLocal() {
  try {
    indexedDB.deleteDatabase("cree-sanctum-v1");
  } catch {
    /* */
  }
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* */
  }
}

export function IdentityPanel() {
  const { activeSeat, refresh, profile, patchProfile } = useSanctum();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [mood, setMoodText] = useState("");
  const [fullLinks, setFullLinks] = useState(false);
  const [history, setHistory] = useState(true);
  const [recvMedia, setRecvMedia] = useState(true);
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState("");
  const [stated, setStated] = useState("");
  const [myName, setMyName] = useState("");
  const [w1, setW1] = useState(false);
  const [w2, setW2] = useState(false);
  const [w3, setW3] = useState(false);
  const [w4, setW4] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTyped, setExportTyped] = useState("");
  const [backupWrapVersion, setBackupWrapVersion] = useState<number | null>(null);
  const [backupBannerDismissed, setBackupBannerDismissed] = useState(false);
  const gpsLocked = Boolean(profile?.gps_consent);

  useEffect(() => {
    if (!profile) return;
    setRecvMedia(profile.receive_media !== false);
    setMyName(profile.display_name === "Unsigned" ? "" : profile.display_name || "");
  }, [profile]);

  // No stored record means this seat has never exported the new AES-GCM (v3)
  // wrap — treat it the same as a known-legacy (v2) backup so the nudge
  // banner below shows until the operator exports a fresh v3 file.
  useEffect(() => {
    if (!activeSeat) return;
    let cancelled = false;
    void getMeta<number>(`backup-wrap-version:${activeSeat.seatId}`).then((v) => {
      if (!cancelled) setBackupWrapVersion(v ?? 2);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSeat?.seatId]);

  useEffect(() => {
    if (!profile?.throwaway || profile.username_claimed || !profile.id) return;
    setHandle((cur) => cur || mintOperatorUsername(profile.id));
  }, [profile?.throwaway, profile?.username_claimed, profile?.id]);

  if (!activeSeat) return <p>Loading identity…</p>;
  const seat = activeSeat;

  async function backupIdentity() {
    if (pass.length < 8 || pass !== pass2) {
      window.alert("Passphrase must be 8+ characters and match.");
      return;
    }
    const file = await wrapSecretBackup(seat.identity, pass);
    downloadBlob(`sanctum-identity-${seat.identity.fingerprint.slice(0, 8)}.json`, file);
    await setMeta(`backup-wrap-version:${seat.seatId}`, 3);
    setBackupWrapVersion(3);
  }

  function confirmDeviceExport() {
    if (!matchesExportConfirmation(exportTyped, seatLabel(profile?.display_name))) return;
    downloadBlob(
      `UNPROTECTED-sanctum-device-${seat.seatId.slice(0, 8)}.key.json`,
      JSON.stringify({
        format: "sanctum-device-key-v1",
        warning:
          "This file is the seat key in the clear. Anyone who holds it can read mail to this device until the key is rotated. Store it offline.",
        publicJwk: seat.device.publicJwk,
        privateJwk: seat.device.privateJwk,
        createdAt: seat.device.createdAt,
      }),
    );
    setExportOpen(false);
    setExportTyped("");
  }

  async function rotateDevice() {
    if (
      !window.confirm(
        "A new device key cannot read old mail. Identity fingerprint stays. Friends must accept the new device binding.",
      )
    )
      return;
    setBusy(true);
    try {
      const device = await generateDeviceKey();
      const next = { ...seat, device };
      await saveSeat(next);
      await republishSeat(next);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File) {
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      window.alert("SVG is not allowed.");
      return;
    }
    const img = await file.arrayBuffer();
    const blob = new Blob([img]);
    const url = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise((res, rej) => {
      image.onload = res;
      image.onerror = rej;
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, size, size);
    const data = canvas.toDataURL("image/jpeg", 0.7);
    URL.revokeObjectURL(url);
    const hash = await sha256Hex(data);
    await updateProfileFields({ data: { photoData: data, photoHash: hash } });
  }

  async function wipeSeat(kind: "delete" | "start") {
    const msg =
      kind === "start"
        ? "This will delete your account and start over. It cannot be recovered."
        : "This will delete your account, and it cannot be recovered.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await deleteMyAccount({ data: { confirm: "DELETE" } });
      await wipeLocal();
      await signOut("/");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-3xl">Identity</h1>
        <p className="mt-3 text-ink-soft">
          A story is only a story if the right person hears it.
        </p>
        <p className="mt-2 font-medium">{seatLabel(profile?.display_name)}</p>
        {profile?.throwaway && (
          <p className="mt-1 text-sm text-muted">
            Throwaway seat. The public handle is operator_ plus numbers so a generated
            key cannot squat a lasting name. operator_ cannot be deleted.
          </p>
        )}
        {profile?.username_claimed && profile.username && (
          <p className="mt-1 text-sm text-muted">@{profile.username}</p>
        )}
      </div>

      <section className="rounded-xl border border-border bg-paper-elevated p-5">
        <p className="text-sm font-medium text-muted">Messaging identity · {activeSeat.identity.algo}</p>
        <p className="mt-3 font-mono text-lg leading-relaxed tracking-wide">
          {formatFingerprint(activeSeat.identity.fingerprint)}
        </p>
        <p className="mt-2 text-sm text-muted">
          Created {new Date(activeSeat.identity.createdAt).toLocaleString()} · short id{" "}
          {activeSeat.identity.fingerprint.slice(-8)}
        </p>
        <p className="mt-3 text-sm">User ID on the cert: {activeSeat.identity.userId}</p>
      </section>

      <section className="rounded-xl border border-border bg-paper-elevated p-5 space-y-3">
        <h2 className="text-xl">Sanctum device key</h2>
        <p className="text-sm text-ink-soft">
          ECDH P-256. Lives on this device. The server holds only the public JWK
          plus the OpenPGP binding signature.
        </p>
        <p className="font-mono text-sm break-all">x {activeSeat.device.publicJwk.x}</p>
        <p className="font-mono text-sm break-all">y {activeSeat.device.publicJwk.y}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => setExportOpen(true)}>
            Download device key
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void rotateDevice()}>
            New device key
          </Button>
        </div>
        {exportOpen && (
          <div className="rounded-lg border border-danger bg-danger-fog p-3 space-y-2">
            <p className="text-sm text-danger">
              This file is the seat key in the clear. Anyone who holds it can read
              mail to this device until the key is rotated. Store it offline.
            </p>
            <p className="text-sm">
              Type <span className="font-mono font-semibold">EXPORT</span> or your
              seat handle ({seatLabel(profile?.display_name)}) to continue.
            </p>
            <Input
              value={exportTyped}
              onChange={(e) => setExportTyped(e.target.value)}
              placeholder="EXPORT"
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={!matchesExportConfirmation(exportTyped, seatLabel(profile?.display_name))}
                onClick={confirmDeviceExport}
              >
                Confirm export
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setExportOpen(false);
                  setExportTyped("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-paper-elevated p-5 space-y-3">
        <h2 className="text-xl">Passphrase-wrapped identity backup</h2>
        <p className="rounded-lg bg-warn-fog p-3 text-sm text-warn">
          Anyone with this file and the passphrase can impersonate you. The
          secret is wrapped with HKDF-SHA-256 and AES-256-GCM on this device.
          It is never uploaded. The sixteen-word phrase is the seat restore
          path; this file is an extra copy.
        </p>
        {backupWrapVersion !== null && backupWrapVersion < 3 && !backupBannerDismissed && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-warn bg-warn-fog p-3 text-sm text-warn">
            <p>
              Export a new sealed backup.
            </p>
            <button
              type="button"
              className="shrink-0 text-xs underline"
              onClick={() => setBackupBannerDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        )}
        <Input type="password" placeholder="Passphrase (min 8)" value={pass} onChange={(e) => setPass(e.target.value)} />
        <Input type="password" placeholder="Repeat passphrase" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        <Button variant="secondary" onClick={() => void backupIdentity()}>
          Download identity backup
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-paper-elevated p-5 space-y-3">
        <h2 className="text-xl">Mood · 48 hours</h2>
        <p className="text-sm text-muted">Text only here. No comments, no shares. Voice mood is a later note in the same mailbox.</p>
        <Textarea value={mood} onChange={(e) => setMoodText(e.target.value)} placeholder="A public bubble for Discover" />
        <Button
          onClick={async () => {
            await setMood({ data: { text: mood.trim() || null } });
            setMoodText("");
          }}
        >
          Set mood
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-paper-elevated p-5 space-y-3">
        <h2 className="text-xl">Portrait</h2>
        <p className="text-sm text-muted">
          Shown in-app. There is no download button. Screenshots still exist.
          SVG is refused.
        </p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="block"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPhoto(f);
          }}
        />
      </section>

      <section className="rounded-xl border border-border bg-paper-elevated p-5 space-y-3">
        <h2 className="text-xl">Safety</h2>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} className="h-5 w-5" />
          Chat history on (off disables messaging)
        </label>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" checked={fullLinks} onChange={(e) => setFullLinks(e.target.checked)} className="h-5 w-5" />
          Full links allowed (warned — not the conservative default)
        </label>
        <label className="flex min-h-12 items-start gap-3">
          <input type="checkbox" checked={recvMedia} onChange={(e) => setRecvMedia(e.target.checked)} className="mt-1 h-5 w-5" />
          <span>
            Receive pictures and video. Off refuses inbound stills and clips.
            Unsolicited pictures were a social-media plague. Stills stay black
            until you tap Open. This path is hardened; it can still be abused.
          </span>
        </label>
        <Button
          variant="secondary"
          onClick={async () => {
            const res = await updateSafety({
              data: { history_enabled: history, full_links_allowed: fullLinks, receive_media: recvMedia },
            });
            patchProfile({ receive_media: res.receive_media });
          }}
        >
          Save safety
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-paper-elevated p-5 space-y-3">
        <h2 className="text-xl">What friends call you</h2>
        <p className="text-sm text-ink-soft">
          If this is empty, the desk shows Unsigned. OAuth names are not used.
        </p>
        <Input value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Unsigned until you type one" />
        <Button
          variant="secondary"
          onClick={async () => {
            await updateProfileFields({ data: { displayName: myName } });
            await refresh();
          }}
        >
          Save name
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-paper-elevated p-5 space-y-3">
        <h2 className="text-xl">Username</h2>
        <p className="text-sm text-ink-soft">
          {profile?.throwaway
            ? "Generated-key seats keep a grey operator_ prefix you cannot backspace away. Only the numbers change. The name friends call you can still be a name or a pseudonym. A laid-down handle cannot be used again."
            : "Unique while this seat lives. Stealth keeps you out of public search. E-mail, X, and Google seats may choose any unique handle. Unsigned seats without a username stay unsearchable except to existing friends. A laid-down name cannot be used again."}
        </p>
        {profile?.username_claimed ? (
          <p className="font-mono">@{profile.username}</p>
        ) : profile?.throwaway ? (
          <>
            <OperatorHandleInput
              digits={operatorDigits(handle)}
              onDigits={(d) => setHandle(composeOperatorUsername(d))}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await claimUsername({ data: { username: composeOperatorUsername(operatorDigits(handle)) } });
                  await refresh();
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Could not claim that name");
                }
              }}
            >
              Publish username
            </Button>
          </>
        ) : (
          <>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="claim a handle"
              autoCapitalize="none"
            />
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await claimUsername({ data: { username: handle } });
                  await refresh();
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Could not claim that name");
                }
              }}
            >
              Publish username
            </Button>
          </>
        )}
      </section>

      <section className="rounded-xl border border-border bg-paper-elevated p-5 space-y-3">
        <h2 className="text-xl">Stated location</h2>
        <p className="text-sm text-ink-soft">
          {gpsLocked
            ? "GPS is on. This string is locked. Device-reported region is on your card. Turn GPS off on the taskbar to edit this line."
            : "An ordinary string you may type. Marked stated location, not device-reported. GPS is the red square on the taskbar, default off."}
        </p>
        <Input
          value={stated}
          onChange={(e) => setStated(e.target.value)}
          placeholder="e.g. Flagstaff"
          disabled={gpsLocked}
        />
        <Button
          variant="secondary"
          disabled={gpsLocked}
          onClick={async () => {
            await updateProfileFields({ data: { city: stated } });
            patchProfile({
              location_text: stated,
              location_kind: stated ? "stated" : "none",
              location_mode: "stated",
            });
            await refresh();
          }}
        >
          Save stated location
        </Button>
        {gpsLocked && profile?.location_text && (
          <p className="text-sm">device-reported · {profile.location_text}</p>
        )}
      </section>

      <section className="rounded-xl border border-danger bg-danger-fog p-5 space-y-3">
        <h2 className="text-xl">Delete this account</h2>
        <label className="flex min-h-12 items-start gap-3 text-sm">
          <input type="checkbox" checked={w1} onChange={(e) => setW1(e.target.checked)} className="mt-1 h-5 w-5" />
          This removes the live seat now.
        </label>
        <label className="flex min-h-12 items-start gap-3 text-sm">
          <input type="checkbox" checked={w2} onChange={(e) => setW2(e.target.checked)} className="mt-1 h-5 w-5" />
          If you instead go idle, after 365 days the live seat is removed anyway and the username / identity cannot be recovered.
        </label>
        <label className="flex min-h-12 items-start gap-3 text-sm">
          <input type="checkbox" checked={w3} onChange={(e) => setW3(e.target.checked)} className="mt-1 h-5 w-5" />
          Chat plaintext was never on the server.
        </label>
        <label className="flex min-h-12 items-start gap-3 text-sm">
          <input type="checkbox" checked={w4} onChange={(e) => setW4(e.target.checked)} className="mt-1 h-5 w-5" />
          Chat plaintext was never on the server. This desk does not keep an
          admin key that lists who talked to whom.
        </label>
        <p className="text-sm">
          If you have sent or received pictures, they may exist on other
          people's computers, and we cannot delete those. Your username will
          be reserved and cannot be used again.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="danger" disabled={busy || !w1 || !w2 || !w3 || !w4} onClick={() => void wipeSeat("delete")}>
            Delete my account
          </Button>
          <Button variant="danger" disabled={busy || !w1 || !w2 || !w3 || !w4} onClick={() => void wipeSeat("start")}>
            Start over
          </Button>
        </div>
      </section>
    </div>
  );
}
