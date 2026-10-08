/** Tiny square marks in the spirit of the BC donation face. Not UI chrome. */

export const EMOTE_IDS = ["happy", "sad", "angry", "care", "laugh", "pushback", "wait"] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

export const EMOTE_LABEL: Record<EmoteId, string> = {
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
  care: "Care",
  laugh: "Laugh",
  pushback: "F you",
  wait: "Wait",
};

export function isEmoteToken(text: string): EmoteId | null {
  const m = text.trim().match(/^::emote:(happy|sad|angry|care|laugh|pushback|wait)::$/);
  return (m?.[1] as EmoteId) ?? null;
}

export function emoteToken(id: EmoteId): string {
  return `::emote:${id}::`;
}

export function EmoteMark({ id, size = 18 }: { id: EmoteId; size?: number }) {
  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 32 32",
    "aria-hidden": true as const,
  };
  if (id === "wait") {
    return (
      <svg {...common}>
        <rect width="32" height="32" fill="#f5d76e" stroke="#111" strokeWidth="2" />
        <text x="16" y="22" textAnchor="middle" fontSize="16" fontFamily="Georgia, serif" fill="#111">
          …
        </text>
      </svg>
    );
  }
  if (id === "pushback") {
    return (
      <svg {...common}>
        <rect width="32" height="32" fill="#f5d76e" stroke="#111" strokeWidth="2" />
        {/* Raised middle finger. The only joke: a push-back at thumbs-up culture. */}
        <path
          d="M7 20 h3 v-3.2 a1.2 1.2 0 0 1 2.4 0 V20 h1.1 V7.2 a1.5 1.5 0 0 1 3 0 V20 h1.1 v-3.4 a1.15 1.15 0 0 1 2.3 0 V20 h1.1 v-2.2 a1.05 1.05 0 0 1 2.1 0 V22.5 c0 3.2-2.4 5.5-6.2 5.5 H12.4 C9.2 28 7 25.8 7 22.8 Z"
          fill="#111"
        />
        <path d="M4.8 19.2 h3.4 v5.2 H6.2 a1.4 1.4 0 0 1-1.4-1.4 z" fill="#111" />
      </svg>
    );
  }
  const mouth =
    id === "happy"
      ? "M10 20 Q16 26 22 20"
      : id === "sad"
        ? "M10 24 Q16 18 22 24"
        : id === "angry"
          ? "M10 22 L22 22"
          : id === "care"
            ? "M16 24 l-5-6 a3.5 3.5 0 1 1 5-3 a3.5 3.5 0 1 1 5 3 z"
            : "M9 18 Q16 28 23 18";
  const brows =
    id === "angry" ? (
      <path d="M8 10 L14 12 M18 12 L24 10" stroke="#111" strokeWidth="2" fill="none" />
    ) : id === "laugh" ? (
      <path d="M9 10 Q12 8 15 10 M17 10 Q20 8 23 10" stroke="#111" strokeWidth="1.6" fill="none" />
    ) : null;
  return (
    <svg {...common}>
      <rect width="32" height="32" fill="#f5d76e" stroke="#111" strokeWidth="2" />
      <circle cx="11" cy="13" r="2" fill="#111" />
      <circle cx="21" cy="13" r="2" fill="#111" />
      {brows}
      <path d={mouth} stroke="#111" strokeWidth="2" fill={id === "care" ? "#c41e22" : "none"} />
    </svg>
  );
}

export function EmotePicker({ onPick }: { onPick: (id: EmoteId) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="listbox" aria-label="Emoticons">
      {EMOTE_IDS.map((id) => (
        <button
          key={id}
          type="button"
          title={EMOTE_LABEL[id]}
          aria-label={EMOTE_LABEL[id]}
          className="grid h-11 w-11 place-items-center border border-border bg-paper hover:bg-signal-fog"
          onClick={() => onPick(id)}
        >
          <EmoteMark id={id} size={28} />
        </button>
      ))}
    </div>
  );
}

export function MessageBody({ text }: { text: string }) {
  const em = isEmoteToken(text);
  if (em) {
    return (
      <span className="inline-flex items-center gap-2">
        <EmoteMark id={em} size={40} />
        <span className="sr-only">{EMOTE_LABEL[em]}</span>
      </span>
    );
  }
  return <p className="whitespace-pre-wrap break-words">{text}</p>;
}
