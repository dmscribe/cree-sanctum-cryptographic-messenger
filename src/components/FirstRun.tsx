import { useEffect, useState } from "react";
import { LogoMark } from "./LogoMark";
import { Button } from "./ui/button";
import { Input, Textarea } from "./ui/input";
import { OperatorHandleInput } from "./OperatorHandleInput";
import { useSanctum } from "./SanctumProvider";
import {
  composeOperatorUsername,
  isOperatorUsername,
  mintOperatorUsername,
  operatorDigits,
  validUsername,
} from "@/lib/desk/identity";

export function FirstRun() {
  const { finishFirstRun, profile } = useSanctum();
  const throwaway = Boolean(profile?.throwaway);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [opDigits, setOpDigits] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [choice, setChoice] = useState<"discover" | "stealth" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!throwaway || !profile?.id) return;
    setOpDigits((cur) => (cur ? cur : operatorDigits(mintOperatorUsername(profile.id))));
  }, [throwaway, profile?.id]);

  const composed = throwaway ? composeOperatorUsername(opDigits) : username;
  const handleIssue = throwaway
    ? opDigits && !isOperatorUsername(composed)
      ? "Numbers only, at least 3 digits. operator_ stays."
      : null
    : username.trim() && !validUsername(username)
      ? "Use 3–24 letters, numbers, _ or -. Generated-key handles are reserved."
      : null;

  return (
    <div className="mx-auto max-w-xl space-y-3 p-1">
      <div className="flex justify-center">
        <LogoMark className="h-12 w-12" />
      </div>
      <h1 className="text-center text-2xl">Before you speak</h1>
      <p className="text-center text-ink-soft">
        Keys are made on this device. The server stores noise. Fingerprints are
        how you know it is really them. You may stay Unsigned.
      </p>
      <label className="block space-y-2">
        <span className="text-sm font-medium">What should friends call you? (optional)</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name or a pseudonym" />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">
          {throwaway
            ? "Handle (operator_ is locked)"
            : "Username (optional, unique, how people find you)"}
        </span>
        {throwaway ? (
          <OperatorHandleInput digits={opDigits} onDigits={setOpDigits} disabled={busy} />
        ) : (
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="like a chat handle"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        )}
        {handleIssue ? (
          <span className="text-xs text-danger">{handleIssue}</span>
        ) : (
          <span className="text-xs text-muted">
            {throwaway
              ? "operator_ cannot be deleted. Only the numbers change. That is how a generated key is recognised. The name friends call you, above, can still be a name or a pseudonym."
              : "Without a username you stay unsearchable except to people already friends with you. E-mail, X, and Google seats may choose any unique handle."}
          </span>
        )}
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Stated location (optional — a string you type. GPS is a separate control on the taskbar.)</span>
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Flagstaff" />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">A short description</span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Who you are, in your own words"
        />
      </label>
      <p className="font-medium">How do you want to begin?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setChoice("discover")}
          className={`min-h-28 border p-4 text-left ${
            choice === "discover" ? "border-signal bg-signal-fog" : "border-border bg-paper-elevated"
          }`}
        >
          <p className="font-medium text-lg">Radar on</p>
          <p className="mt-2 text-sm text-ink-soft">
            Nine cards. A lesson in how old networks trained you to come back.
            You can shut it off. GPS is a separate control: a regional ghost
            finds you when it is on.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setChoice("stealth")}
          className={`min-h-28 border p-4 text-left ${
            choice === "stealth" ? "border-signal bg-signal-fog text-ink" : "border-border bg-paper-elevated"
          }`}
        >
          <p className="font-medium text-lg">Stealth</p>
          <p className="mt-2 text-sm text-ink-soft">
            One lever. The radar dies. Friends you already have, and encrypted
            rooms, stay. GPS still works if you turn it on.
          </p>
        </button>
      </div>
      <Button
        disabled={!choice || busy || Boolean(handleIssue)}
        className="w-full"
        onClick={async () => {
          setBusy(true);
          try {
            await finishFirstRun({
              displayName: name.trim(),
              username: throwaway ? composed : username.trim(),
              description,
              city,
              discoverOn: choice === "discover",
            });
          } catch (e) {
            window.alert(e instanceof Error ? e.message : "Could not generate identity");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Making keys on this device…" : "Generate my identity"}
      </Button>
      <p className="text-center text-sm text-muted">
        Secret keys never leave this device. If you skip a name, this seat is Unsigned.
        Copy the sixteen Cree and Navajo words, or write them on paper, before you need them.
      </p>
    </div>
  );
}
