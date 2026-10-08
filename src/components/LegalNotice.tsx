const LICENCE_LINE =
  "Developer | Open-source github.com/dmscribe | MIT, Apache License | Copyright (c)";

export function legalYear(): number {
  return new Date().getFullYear();
}

/** Front-page strip. Exact product wording. */
export function LegalNotice({ className }: { className?: string }) {
  const year = legalYear();
  return (
    <div className={className}>
      <p>
        Developer | Open-source{" "}
        <a
          href="https://github.com/dmscribe"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-border-strong underline-offset-2 hover:text-ink"
        >
          github.com/dmscribe
        </a>{" "}
        | MIT, Apache License
      </p>
      <p>Copyright (c) {year} Cree Sanctum Cryptographic Messenger</p>
      <p>
        <a href="/legal" className="underline decoration-border-strong underline-offset-2 hover:text-ink">
          Terms of service
        </a>
      </p>
    </div>
  );
}

export { LICENCE_LINE };
