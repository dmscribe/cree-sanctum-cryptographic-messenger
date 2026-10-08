import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/source")({
  component: SourcePage,
});

function SourcePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-3xl">C++ source of truth</h1>
      <p className="text-ink-soft">
        Cree Sanctum Cryptographic Messaging. The web cockpit mirrors the
        protocol. New engines live in C++17: libsanctum (mailbox + voice TTL),
        libpgpbind (identity bind), libsuggest (PYMK), sanctumd (thin HTTP).
      </p>
      <ul className="list-disc space-y-1 pl-5 text-ink-soft">
        <li>libsanctum — ciphertext field names, 24h voice TTL, size caps</li>
        <li>libpgpbind — sanctum-device-v1 binding, refuse swapped JWK</li>
        <li>libsuggest — generate → score → filter → slot, no all-pairs scan</li>
        <li>sanctumd — /sanctum/* and /v1/* suggest routes</li>
      </ul>
      <p className="text-sm text-muted">Build: make -C . test · Compiler: g++ -std=c++17</p>
      <a href="/cree-sanctum-cpp.zip" download>
        <Button>Download C++ tree</Button>
      </a>
      <p className="text-sm text-muted">
        Author: Daniel Scribe — github.com/dmscribe. This tree does not phone
        home.
      </p>
    </div>
  );
}
