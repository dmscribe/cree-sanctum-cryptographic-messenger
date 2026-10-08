import { useState } from "react";
import { Button } from "../ui/button";
import { LogoMark } from "../LogoMark";
import { useDesk } from "@/lib/desk/store";

const BTC = "1Xaya5XhGqX7d7pjtcXCgPUz8jsjhd3t1";

export function AboutWin() {
  const { open } = useDesk();
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <LogoMark className="h-16 w-16" />
        <div>
          <h1 className="text-xl">Cree Sanctum Cryptographic Messaging</h1>
          <p className="text-sm text-muted">The desk. C++ is the tree.</p>
        </div>
      </div>
      <p className="text-ink-soft">
        Sealed text and walkie-talkie voice. Identity stays bound to the device.
        Discover is optional. Moods are short-lived status with a visible clock.
      </p>
      <section className="space-y-2 text-sm text-ink-soft">
        <h2 className="text-lg text-ink">User guide</h2>
        <p>
          Short, plain language about ciphertext, fingerprints, bindings,
          receipts, Stealth, and backups. Copy it into an assistant you already
          trust if you want a slower walkthrough.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/cree-sanctum-guide.txt" download>
            <Button variant="secondary">Download TXT</Button>
          </a>
          <a href="/cree-sanctum-guide.pdf" download>
            <Button variant="secondary">Download PDF</Button>
          </a>
        </div>
      </section>
      <section className="space-y-2 text-sm text-ink-soft">
        <h2 className="text-lg text-ink">Legal notice</h2>
        <p>
          By using this program you agree to the{" "}
          <a href="/legal" className="underline">
            terms of service
          </a>
          . It is a language-preservation and privacy desk for chosen
          conversation. Dual-licensed MIT and Apache 2.0. No warranty of any
          kind. A fork stands on its own authorship.
        </p>
        <p>
          Ciphertext is the mail. The server is treated as untrusted for key
          swaps. Fingerprints are the ritual that catches a swapped key. GPS is
          consent-based, coarse, and spoofable. Throwaway seats and unsigned
          seats are first-class parts of the product.
        </p>
        <p>
          Human device keys stay in the browser vault. Network-servant private
          keys live in `ghost_vaults` so those voices can decrypt and reply in a
          separate domain. Gravelogs are public markers that a username was laid
          down. IP hashes, not raw addresses, feed the rate limiter.
        </p>
        <p>
          Donations help keep the desk running. They do not buy priority,
          privilege, or product direction.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/LICENSE-MIT.txt" download>
            <Button variant="secondary">MIT licence</Button>
          </a>
          <a href="/LICENSE-APACHE.txt" download>
            <Button variant="secondary">Apache 2.0 licence</Button>
          </a>
        </div>
      </section>
      <section className="space-y-2 text-sm text-ink-soft">
        <h2 className="text-lg text-ink">Donations</h2>
        <div className="flex items-center gap-3">
          <img src="/bc.png" alt="Bitcoin" className="h-12 w-12 border border-border" />
          <p>
            Please donate to keep the desk maintained and to support more
            software. If you want public thanks, include your name in the
            Bitcoin donation message.
          </p>
        </div>
        <p className="break-all font-mono text-sm text-ink">{BTC}</p>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(BTC);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy Bitcoin address"}
        </Button>
      </section>
      <section className="space-y-2 text-sm text-ink-soft">
        <h2 className="text-lg text-ink">C++ source of truth</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>libsanctum — ciphertext field names, 24h voice TTL, size caps</li>
          <li>libpgpbind — sanctum-device-v1 binding, refuse swapped JWK</li>
          <li>libsuggest — generate → score → filter → slot</li>
          <li>sanctumd — thin HTTP + WebSocket surface</li>
        </ul>
        <p className="text-muted">Build: make -C . test · g++ -std=c++17</p>
        <a href="/cree-sanctum-cpp.zip" download>
          <Button>Download C++ tree</Button>
        </a>
      </section>
      <section className="space-y-2 text-sm text-ink-soft">
        <h2 className="text-lg text-ink">Project map</h2>
        <img
          src="/system-diagram.svg"
          alt="Who holds keys, what the server stores, how text and voice move"
          className="w-full border border-border bg-paper-elevated"
        />
        <p>
          Device holds Ed25519 identity secret and P-256 device secret. Server
          stores ciphertext, public JWK, armored public cert, binding signature,
          timestamps, and graph edges. Stealth turns radar off while threads
          stay.
        </p>
      </section>
      <button
        type="button"
        className="text-sm underline"
        onClick={() =>
          open({ id: "nodelog", kind: "nodelog", title: "Node log", x: 160, y: 80, w: 560, h: 400 })
        }
      >
        Node log (radar internals)
      </button>
      <p className="text-sm text-muted">Author: Daniel Scribe · github.com/dmscribe · x.com/danRydr</p>
    </div>
  );
}
