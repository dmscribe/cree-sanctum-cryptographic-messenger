import { useEffect, useState } from "react";
import {
  OAUTH_PROVIDERS,
  authEnabled,
  authClient,
  signIn,
  setLandingHold,
  persistThrowawayReady,
  readThrowawayReady,
  markForceLanding,
} from "@/lib/auth/client";
import { LogoMark } from "./LogoMark";
import { LegalNotice } from "./LegalNotice";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { signBinding } from "@/lib/sanctum/pgp";
import { saveSeat } from "@/lib/sanctum/vault";
import { decodePrivateKey, unwrapSeatKey } from "@/lib/sanctum/seat-key";
import { generateTalkerSeat, looksLikeTalkerPhrase, openTalkerPhrase } from "@/lib/sanctum/talker";
import { bootstrapMe, publishKeys } from "@/lib/server/profile";

type AuthData = { user?: { id?: string }; token?: string } | null;

const KEY_WARNING =
  "These sixteen words are your private key — Cree and Navajo, the way code talkers carried a message in ordinary speech. Copy them, or write them on paper. Anyone who has the phrase can sit in this seat. We do not give you a file to download.";

export function Landing({ showAuth = true }: { showAuth?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [restoreText, setRestoreText] = useState("");
  const [panel, setPanel] = useState<"none" | "throwaway" | "restore" | "ready">("none");
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = readThrowawayReady();
    if (!stored) return;
    setReadyKey(stored.text);
    setPanel("ready");
    setLandingHold(true);
  }, []);

  async function dropPriorSession() {
    markForceLanding(false);
    try {
      await Promise.race([
        authClient.signOut().then(() => undefined),
        new Promise((r) => setTimeout(r, 800)),
      ]);
    } catch {
      /* none or already gone */
    }
  }

  async function emailAuth() {
    setErr(null);
    setBusy(true);
    try {
      await dropPriorSession();
      if (mode === "up") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: "Unsigned",
        });
        if (res.error) throw new Error(res.error.message || "Could not create account");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "Could not sign in");
      }
      markForceLanding(false);
      window.location.assign("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateThrowaway() {
    setErr(null);
    setBusy(true);
    setBusyStep("Opening a seat…");
    setPanel("throwaway");
    setLandingHold(true);
    try {
      await dropPriorSession();
      const { phrase, material } = generateTalkerSeat();
      const res = await authClient.signUp.email({
        email: material.email,
        password: material.password,
        name: "Unsigned",
      });
      if (res.error) throw new Error(res.error.message || "Could not open a throwaway seat");
      const data = res.data as AuthData;
      let userId = data?.user?.id;
      if (!userId) {
        const session = await authClient.getSession();
        userId = session.data?.user?.id;
      }
      if (!userId) throw new Error("Seat opened, but the session did not return. Try again, or use email.");
      setBusyStep("Making keys on this device…");
      try {
        await bootstrapMe({ data: { throwaway: true } });
      } catch {
        /* desk will bootstrap on Continue */
      }
      const binding = signBinding(
        material.identity.secretKeyHex,
        userId,
        material.device.publicJwk,
        material.device.createdAt,
      );
      try {
        await saveSeat({
          seatId: userId,
          displayName: "Unsigned",
          device: material.device,
          identity: material.identity,
        });
      } catch {
        /* vault falls back; the phrase is the source of truth */
      }
      try {
        await publishKeys({
          data: {
            seatId: userId,
            sanctum_public_key: material.device.publicJwk,
            openpgp_public_key: material.identity.publicKeyArmored,
            fingerprint: material.identity.fingerprint,
            device_binding_payload: binding.payload,
            device_binding_signature: binding.signature,
          },
        });
      } catch {
        /* republish after Continue */
      }
      persistThrowawayReady({ name: "talker", text: phrase });
      setReadyKey(phrase);
      setCopied(false);
      setPanel("ready");
    } catch (e) {
      setLandingHold(false);
      setPanel("none");
      setErr(e instanceof Error ? e.message : "Could not generate a key");
    } finally {
      setBusy(false);
      setBusyStep("");
    }
  }

  async function restoreFromKey() {
    setErr(null);
    const pasted = restoreText.trim();
    if (!pasted) {
      setErr("Paste your private key first.");
      return;
    }
    setBusy(true);
    try {
      await dropPriorSession();
      let email: string;
      let password: string;
      let identity;
      let device;
      if (looksLikeTalkerPhrase(pasted)) {
        const material = openTalkerPhrase(pasted);
        email = material.email;
        password = material.password;
        identity = material.identity;
        device = material.device;
      } else if (pasted.replace(/\s+/g, "").startsWith("CSK1.")) {
        const payload = decodePrivateKey(pasted);
        email = payload.email;
        password = payload.password;
        identity = payload.identity;
        device = payload.device;
      } else {
        if (restorePass.length < 8) {
          setErr("That looks like an old wrapped key. Enter the passphrase that opens it.");
          setBusy(false);
          return;
        }
        const payload = await unwrapSeatKey(pasted, restorePass);
        email = payload.email;
        password = payload.password;
        identity = payload.identity;
        device = payload.device;
      }
      const res = await authClient.signIn.email({ email, password });
      if (res.error) throw new Error(res.error.message || "Could not sign in with that key");
      const userId = (res.data as AuthData)?.user?.id;
      if (!userId) throw new Error("Signed in, but the session did not return a seat.");
      await saveSeat({
        seatId: userId,
        displayName: "Unsigned",
        device,
        identity,
      });
      try {
        const binding = signBinding(identity.secretKeyHex, userId, device.publicJwk, device.createdAt);
        await publishKeys({
          data: {
            seatId: userId,
            sanctum_public_key: device.publicJwk,
            openpgp_public_key: identity.publicKeyArmored,
            fingerprint: identity.fingerprint,
            device_binding_payload: binding.payload,
            device_binding_signature: binding.signature,
          },
        });
      } catch {
        /* keys already on the seat */
      }
      markForceLanding(false);
      window.location.assign("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open that private key");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!readyKey) return;
    setErr(null);
    try {
      await navigator.clipboard.writeText(readyKey);
      setCopied(true);
    } catch {
      setErr("Could not copy. Select the key and copy it yourself.");
    }
  }

  function continueToDesk() {
    if (!copied) {
      const go = window.confirm(
        "You have not copied your sixteen words. You will need them to sign in again. Continue anyway?",
      );
      if (!go) return;
    }
    persistThrowawayReady(null);
    setLandingHold(false);
    markForceLanding(false);
    window.location.assign("/");
  }

  const focused = panel === "throwaway" || panel === "ready" || panel === "restore";

  return (
    <main className="page-scroll bg-desk px-4 py-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center">
          <LogoMark className={focused ? "h-16 w-16" : "h-24 w-24 sm:h-28 sm:w-28"} />
          <h1 className={focused ? "mt-3 text-2xl" : "mt-4 text-3xl"}>
            {panel === "throwaway"
              ? "Making a code-talker key"
              : panel === "ready"
                ? "Your code-talker key"
                : panel === "restore"
                  ? "Speak the sixteen words"
                  : "Cree Sanctum Cryptographic Messaging"}
          </h1>
          {panel === "none" && <p className="mt-2 text-ink-soft">Sign on. Talk. Sign off.</p>}
        </div>
        {showAuth && authEnabled ? (
          <>
            {err && (
              <p className="border border-danger bg-danger-fog px-3 py-2 text-sm text-danger" role="alert">
                {err}
              </p>
            )}
            <div className="space-y-3 border border-border bg-paper p-4">
              {panel === "ready" && readyKey ? (
                <div className="space-y-3">
                  <p className="text-sm text-ink">{KEY_WARNING}</p>
                  <div
                    role="list"
                    aria-label="Code talker phrase"
                    className="grid grid-cols-2 gap-x-3 gap-y-1.5 border border-border bg-paper-inset p-3 font-mono text-[13px] leading-snug sm:grid-cols-4 sm:text-sm"
                  >
                    {readyKey.split(/\s+/).map((w, i) => (
                      <div key={i} role="listitem" className="flex min-w-0 items-baseline gap-1.5">
                        <span className="w-5 shrink-0 text-right text-muted tabular-nums">{i + 1}.</span>
                        <span className="truncate">{w}</span>
                      </div>
                    ))}
                  </div>
                  <textarea
                    readOnly
                    aria-label="Private key"
                    className="h-16 w-full resize-y border border-border bg-paper p-2 font-mono text-xs leading-relaxed text-ink"
                    value={readyKey}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  {copied && <p className="text-sm text-signal">Copied. Keep it somewhere only you can read.</p>}
                  <Button className="w-full" onClick={() => void copyKey()}>
                    Copy phrase
                  </Button>
                  <Button className="w-full" onClick={continueToDesk}>
                    Continue to the desk
                  </Button>
                </div>
              ) : panel !== "throwaway" && panel !== "restore" ? (
                <>
                  <p className="text-sm text-ink-soft">
                    No email required. A throwaway seat is usable, not a lasting name. You get
                    sixteen Cree and Navajo words to copy or write down — not a file.
                  </p>
                  <Button className="w-full" disabled={busy} onClick={() => void generateThrowaway()}>
                    {busy ? busyStep || "Making keys on this device…" : "Generate a throwaway key"}
                  </Button>
                  <Button variant="secondary" className="w-full" onClick={() => setPanel("restore")}>
                    Sign in with a private key
                  </Button>
                </>
              ) : panel === "throwaway" ? (
                <div className="space-y-3">
                  <p className="text-sm text-ink-soft">{busyStep || "Making keys on this device…"}</p>
                  <Button className="w-full" disabled>
                    {busyStep || "Making keys on this device…"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-ink-soft">
                    Type or paste the sixteen words in order. Anyone with this phrase can use
                    this seat.
                  </p>
                  <textarea
                    aria-label="Paste private key"
                    placeholder="maskwa shush nipiy dzeh …"
                    className="h-32 w-full resize-y border border-border bg-paper p-2 font-mono text-sm"
                    value={restoreText}
                    onChange={(e) => setRestoreText(e.target.value)}
                    disabled={busy}
                  />
                  {restoreText.trim().startsWith("{") && (
                    <Input
                      type="password"
                      placeholder="Passphrase (old wrapped key)"
                      value={restorePass}
                      onChange={(e) => setRestorePass(e.target.value)}
                      disabled={busy}
                    />
                  )}
                  <Button className="w-full" disabled={busy} onClick={() => void restoreFromKey()}>
                    {busy ? "Opening…" : "Open this seat"}
                  </Button>
                  <button
                    type="button"
                    className="w-full min-h-12 text-sm text-muted underline"
                    disabled={busy}
                    onClick={() => {
                      setPanel("none");
                      setErr(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {!focused && (
              <>
                {OAUTH_PROVIDERS.length > 0 && (
                  <>
                    <div className="space-y-3">
                      {OAUTH_PROVIDERS.map((p) => (
                        <Button
                          key={p.providerId}
                          variant="secondary"
                          className="w-full"
                          onClick={() => {
                            markForceLanding(false);
                            signIn(p.providerId, { callbackURL: "/" });
                          }}
                        >
                          Continue with {p.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-center text-sm text-muted">or use email</p>
                  </>
                )}
                <div className="space-y-3 border border-border bg-paper p-4">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                  />
                  <Button className="w-full" disabled={busy || !email || password.length < 8} onClick={() => void emailAuth()}>
                    {busy ? "Please wait…" : mode === "up" ? "Create account" : "Sign in with email"}
                  </Button>
                  <button
                    type="button"
                    className="w-full min-h-12 text-sm text-muted underline"
                    onClick={() => setMode(mode === "up" ? "in" : "up")}
                  >
                    {mode === "up" ? "Already have an account" : "Create an email account"}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-center text-muted">Opening your seat…</p>
        )}
        <LegalNotice className="text-center text-xs leading-relaxed text-muted" />
      </div>
    </main>
  );
}
