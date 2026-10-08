import { useEffect, useState } from "react";
import { listViews } from "@/lib/server/radar";
import { useSanctum } from "./SanctumProvider";
import { Portrait } from "./Portrait";
import { Button } from "./ui/button";

export function ViewsPanel() {
  const { stealth } = useSanctum();
  const [views, setViews] = useState<{ id: string; display_name: string; recency: string; photo_data?: string | null; kind?: string }[]>([]);
  const [lesson, setLesson] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("sanctum-views-lesson") !== "hide";
  });

  useEffect(() => {
    if (stealth) return;
    void listViews().then((r) => setViews(r.views ?? []));
  }, [stealth]);

  if (stealth) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-3xl">Views</h1>
        <p className="text-ink-soft">
          Stealth is on. You left the Views inbox. Nobody new gets a view on
          you.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl">Views</h1>
      <p className="text-ink-soft">
        They opened your card. That is a view. Views are how old apps trained
        you to return. This list is a mirror, not a ranking.
      </p>
      {lesson && (
        <div className="rounded-xl border border-border bg-paper-elevated p-4 text-sm leading-relaxed">
          <p>You appeared in someone’s inventory.</p>
          <p>They opened you. That is recorded as an open.</p>
          <p>Old networks turned that into a reason to notify you forever.</p>
          <p>Here you can read it, or throw Stealth and the record stops being your problem.</p>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => {
              window.localStorage.setItem("sanctum-views-lesson", "hide");
              setLesson(false);
            }}
          >
            Hide this lesson
          </Button>
        </div>
      )}
      <ul className="space-y-2">
        {views.map((v) => (
          <li
            key={v.id}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-paper-elevated px-4 pt-4"
          >
            <Portrait src={v.photo_data} name={v.display_name} size="sm" servant={v.kind === "servant"} />
            <div className="flex-1">
              <p className="font-medium">{v.display_name}</p>
              <p className="text-sm text-muted">{v.recency}</p>
            </div>
          </li>
        ))}
      </ul>
      {views.length === 0 && <p className="text-muted">No Discover opens on you yet.</p>}
    </div>
  );
}
