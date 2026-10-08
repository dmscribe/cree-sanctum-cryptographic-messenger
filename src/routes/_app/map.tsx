import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/map")({
  component: MapPage,
});

function MapPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl">Project map</h1>
      <p className="text-sm text-muted">Daniel Scribe — github.com/dmscribe</p>
      <img
        src="/system-diagram.svg"
        alt="Who holds keys, what the server stores, how text and voice move, where OpenPGP binds device keys, where MITM checks fire, Discover versus Stealth, Ryder as a network servant"
        className="w-full rounded-xl border border-signal/40 bg-paper-elevated"
      />
      <section className="space-y-2 text-ink-soft">
        <h2 className="text-xl text-ink">Trust boundaries</h2>
        <p>
          Device holds Ed25519 identity secret and P-256 device secret. Server
          stores ciphertext, public JWK, armored public cert, binding signature.
          Network-servant keys live on the server so a process can mirror; real
          operators' secrets never do. Server is untrusted for MITM.
        </p>
        <h2 className="text-xl text-ink">Messaging tree (A)</h2>
        <p>
          encryptFor / decryptMessage. Fields: ciphertext, nonce, eph_pub,
          ciphertext_self, audio_*. Voice expires in 24h and is not anchored.
        </p>
        <h2 className="text-xl text-ink">OpenPGP identity (B)</h2>
        <p>
          Binding statement sanctum-device-v1|user|x|y|created. Refuse send on
          bind failure or fingerprint mismatch. Inner pgp_sig after decrypt.
        </p>
        <h2 className="text-xl text-ink">Discover / Stealth (C)</h2>
        <p>
          Nine cards, Views as a lesson of Discover on_open only. Chat never
          calls on_open. Twelve network servants wear a red ring. Stealth kills
          the radar, not the thread. Ghost bans lift after 14 hours.
        </p>
      </section>
    </div>
  );
}
