import { useRef, type KeyboardEvent, type ClipboardEvent } from "react";
import { OPERATOR_LOCKED_PREFIX, clampOperatorDigits } from "@/lib/desk/identity";

/**
 * Throwaway handle: the word operator_ is grey and not in the editable value,
 * so backspace cannot turn this into an ordinary username.
 */
export function OperatorHandleInput({
  digits,
  onDigits,
  disabled,
}: {
  digits: string;
  onDigits: (digits: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const caretAtStart = start === 0 && end === 0;
    if (e.key === "Backspace" && caretAtStart) {
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowLeft" && caretAtStart) {
      e.preventDefault();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const raw = e.clipboardData.getData("text");
    if (!raw) return;
    e.preventDefault();
    onDigits(clampOperatorDigits(raw));
  }

  return (
    <div
      className="flex min-h-12 w-full cursor-text items-stretch overflow-hidden rounded-md border border-border bg-paper-elevated"
      onClick={() => ref.current?.focus()}
    >
      <span
        className="flex select-none items-center bg-paper-inset px-3 font-mono text-base text-muted"
        aria-hidden
      >
        {OPERATOR_LOCKED_PREFIX}
      </span>
      <input
        ref={ref}
        value={digits}
        disabled={disabled}
        onChange={(e) => onDigits(clampOperatorDigits(e.target.value))}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        inputMode="numeric"
        pattern="[0-9]*"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        placeholder="184029"
        aria-label="Numbers after operator_"
        className="min-h-12 min-w-0 flex-1 border-0 bg-transparent px-3 font-mono text-base text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}
