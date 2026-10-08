import { useEffect, useState } from "react";
import { listMoodBoard } from "@/lib/server/mates";
import { SqPortrait } from "./SqPortrait";

export function MoodsWin() {
  const [items, setItems] = useState<
    { id: string; display_name: string; photo_data: string | null; mood_text: string; mood_expires_at: string }[]
  >([]);

  useEffect(() => {
    void listMoodBoard().then((r) => setItems(r.items ?? []));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-border px-4 py-3 text-sm text-ink-soft">
        Old networks ranked this. Here it is only time.
      </p>
      <ul className="min-h-0 flex-1 overflow-auto">
        {items.map((m) => (
          <li key={m.id + m.mood_expires_at} className="flex gap-3 border-b border-border px-4 py-3">
            <SqPortrait src={m.photo_data} name={m.display_name} size="sm" />
            <div className="min-w-0">
              <p className="font-medium">{m.display_name}</p>
              <p className="text-ink-soft">{m.mood_text}</p>
              <p className="mt-1 text-xs text-muted">
                {new Date(m.mood_expires_at).toLocaleString()} · gone in 48h
              </p>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="px-4 py-6 text-muted">No moods on the clock.</p>}
    </div>
  );
}
