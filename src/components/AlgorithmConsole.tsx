import { useEffect, useState } from "react";
import { listAlgorithmLog } from "@/lib/server/ghosts";

export function AlgorithmConsole() {
  const [joined, setJoined] = useState(false);
  const [shown, setShown] = useState<string[]>([]);
  const [all, setAll] = useState<string[]>([]);

  useEffect(() => {
    void listAlgorithmLog().then((r) => {
      setJoined(r.joined);
      const lines = (r.lines ?? []).map((l: { line: string }) => l.line);
      setAll(lines);
    });
  }, []);

  useEffect(() => {
    if (all.length === 0) return;
    setShown([]);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown(all.slice(0, i));
      if (i >= all.length) clearInterval(t);
    }, 90);
    return () => clearInterval(t);
  }, [all]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl">Node log</h1>
      <p className="text-ink-soft">
        When you join Ryder's Northern Node, everyone on Ryder's friend list is
        run through generate → score → filter → slot. This is the same PYMK
        lesson as Discover. It is not a person thinking.
      </p>
      {!joined && (
        <p className="rounded-xl border border-signal/40 bg-signal-fog p-4 text-sm">
          Befriend Ryder (North Pole) to start a pass. Charlie is the other pole
          — you cannot hold both.
        </p>
      )}
      <pre className="min-h-64 overflow-auto rounded-xl border border-signal/30 bg-console p-4 font-mono text-sm leading-relaxed text-console-ink">
        {shown.length === 0
          ? joined
            ? "waiting for lines…"
            : "# no pass recorded on this seat"
          : shown.join("\n")}
        {shown.length > 0 && shown.length < all.length ? "\n▌" : ""}
      </pre>
    </div>
  );
}
