import { Link } from "@tanstack/react-router";
import { LogoMark } from "./LogoMark";
import { legalYear } from "./LegalNotice";

const SECTIONS = [
  { id: "agreement", label: "Agreement" },
  { id: "purpose", label: "Purpose" },
  { id: "open-source", label: "Open source" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "keys", label: "Keys and seats" },
  { id: "data", label: "What we hold" },
  { id: "lawful", label: "Lawful process" },
  { id: "warranty", label: "No warranty" },
  { id: "liability", label: "Liability" },
  { id: "changes", label: "Changes" },
] as const;

export function LegalPage() {
  const year = legalYear();
  return (
    <main className="page-scroll bg-desk px-4 py-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex flex-col items-center text-center">
          <LogoMark className="h-20 w-20" />
          <h1 className="mt-4 text-3xl">Terms of service</h1>
          <p className="mt-2 max-w-xl text-ink-soft">
            Cree Sanctum Cryptographic Messenger is a language-preservation and
            privacy product. These terms govern the hosted desk. The licences
            govern the code.
          </p>
          <p className="mt-3 text-sm text-muted">
            Last updated 14 September 2026 · Effective on first use
          </p>
        </header>

        <nav
          aria-label="Terms sections"
          className="flex flex-wrap justify-center gap-x-3 gap-y-1 border border-border bg-paper px-3 py-2 text-sm"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-signal underline-offset-2 hover:underline"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <article className="space-y-8 border border-border bg-paper p-5 text-sm leading-relaxed text-ink sm:p-8 sm:text-base">
          <section id="agreement" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">1. Agreement</h2>
            <p>
              By creating a seat, generating a throwaway key, signing in, or
              otherwise using Cree Sanctum Cryptographic Messenger (the
              “Service”), you agree to these terms. If you do not agree, do not
              use the Service.
            </p>
            <p>
              You must be old enough to form a binding contract where you live,
              and in any case not younger than thirteen. You may not use the
              Service on behalf of someone else unless you have authority to
              bind them.
            </p>
            <p>
              These terms are the entire agreement for the hosted Service. They
              do not sell you a licence beyond the open-source licences that
              already apply to the source code. They do not create a
              partnership, employment, or fiduciary duty.
            </p>
          </section>

          <section id="purpose" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">2. Nature and purpose</h2>
            <p>
              The Service is a sealed messenger for private conversation. It was
              built so indigenous nations, tribes, and language communities can
              talk to one another without being forced onto a wide-open public
              network among people they do not know and did not choose.
            </p>
            <p>
              Language preservation is part of that purpose. Everyday Cree and
              Navajo words are used in the throwaway recovery phrase as a living
              nod to code talkers. The product is not a ceremonial authority, a
              government, a bank, a common carrier, or a public square.
            </p>
            <p>
              Discover is optional radar. Stealth turns it off. Unsigned and
              throwaway seats exist so a person can talk without registering a
              lasting public name. None of that is a promise of anonymity, and
              none of that is permission to break the law.
            </p>
          </section>

          <section id="open-source" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">3. Open source</h2>
            <p>
              The software is dual-licensed under the MIT License and Apache
              License 2.0. Copyright (c) {year} Cree Sanctum Cryptographic
              Messenger. Source:{" "}
              <a
                href="https://github.com/dmscribe"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/dmscribe
              </a>
              . Copies of the licences ship with the desk.
            </p>
            <p>
              Open source means you may read, run, modify, and redistribute the
              code under those licences. It does not mean the hosted Service is
              public property. It does not mean the authors owe you support,
              uptime, escrow, or a particular feature. A fork is the fork
              author’s. The licences’ “AS IS” and limitation-of-liability
              clauses apply to the code. These terms apply to the hosted desk.
            </p>
            <p>
              Contributions, donations, and bug reports buy no ownership, no
              privilege on the desk, and no right to direct the project.
            </p>
          </section>

          <section id="acceptable-use" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">4. Acceptable use</h2>
            <p>
              You will obey the law that applies to you. You will not use the
              Service for illegal activity. That includes, without limitation:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>exploitation of children, or any sexual content involving minors</li>
              <li>trafficking, fraud, extortion, or other violent or property crime</li>
              <li>malware, intrusion, account takeover, or disruption of the Service</li>
              <li>harassment, stalking, or threats that are unlawful where you are</li>
              <li>attempts to deanonymize, dox, or unmask people who did not consent</li>
              <li>scraping, bulk harvesting, or running an open relay off the desk</li>
            </ul>
            <p>
              Encryption is not a licence. Privacy is not a shield for crime.
              We may suspend or delete a seat, a network range, or the whole
              Service without prior notice when we reasonably believe these
              terms or the law are being broken. Endpoints fail first. That is
              not a finding of guilt; it is how a small desk stays standing.
            </p>
          </section>

          <section id="keys" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">5. Keys, phrases, and seats</h2>
            <p>
              A generated seat’s private key is sixteen Cree and Navajo words.
              Anyone who has those words can sit in that seat. We do not hold a
              copy. We cannot reset it. If you lose the phrase, the seat is
              gone. If you show the phrase, you have given the seat away.
            </p>
            <p>
              Device keys stay on the device. The server stores ciphertext,
              public keys, and a binding signature. Fingerprints are how you
              catch a swapped key. You are responsible for comparing them with
              the other person. GPS is off unless you turn it on; device
              coordinates stay on the device and are used only to pick a
              nearest regional ghost. Coarse region may be stored with consent.
              GPS can be spoofed.
            </p>
          </section>

          <section id="data" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">6. What we hold</h2>
            <p>We aim to hold as little as a working desk needs:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>account identifiers and public profile fields you choose to publish</li>
              <li>public device keys, fingerprints, and device-binding signatures</li>
              <li>ciphertext, nonces, and ephemeral public keys for mail and voice</li>
              <li>friendship and request edges (who asked, not the words you typed)</li>
              <li>optional coarse location (state/province and country) if you consent</li>
              <li>hashed network addresses for rate limiting, not a public IP ledger</li>
              <li>gravelogs when a claimed username is laid down</li>
            </ul>
            <p>
              We do not store message plaintext. We do not keep an admin secret
              that decrypts mail. We do not offer a who-talked-to-whom tree for
              subpoena theatre. Phones, operating systems, and nearby hardware
              may still record. This is not unbreakable, and we do not say it is.
            </p>
          </section>

          <section id="lawful" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">7. Lawful process</h2>
            <p>
              If a court or other lawful authority with jurisdiction requires
              records we actually have, we may produce those records. We cannot
              produce plaintext we do not have. We will not pretend the Service
              places you beyond the law of the place where you stand.
            </p>
            <p>
              Do not use the Service to hide criminal activity. If you do, these
              terms are evidence that you were told not to, and that the authors
              did not authorise it.
            </p>
          </section>

          <section id="warranty" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">8. No warranty</h2>
            <p>
              THE SERVICE AND THE SOFTWARE ARE PROVIDED “AS IS” AND “AS
              AVAILABLE”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
              INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE,
              QUIET ENJOYMENT, AND NON-INFRINGEMENT. We do not warrant that the
              desk will be uninterrupted, error-free, free of interception, or
              fit to protect you against a well-resourced adversary.
            </p>
            <p>
              Ciphertext on an untrusted server is a design, not a guarantee.
              Keys can be swapped if you skip the fingerprint ritual. A phrase
              written on paper can be photographed. A device can be seized.
            </p>
          </section>

          <section id="liability" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">9. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, the authors, operators,
              contributors, and licensors are not liable for any indirect,
              incidental, special, consequential, exemplary, or punitive
              damages, or any loss of data, profit, goodwill, or conversation,
              arising from the Service or these terms, even if advised of the
              possibility. Direct damages, if any are allowed, are capped at the
              greater of (a) the amount you paid us for the Service in the
              twelve months before the claim, or (b) fifty US dollars. Donations
              are not payment for the Service.
            </p>
            <p>
              You are responsible for your conduct and for what you send. You
              will defend and indemnify the authors and operators against claims
              arising from your use of the Service, your content, or your breach
              of these terms, except to the extent caused by our wilful
              misconduct.
            </p>
            <p>
              Some places do not allow certain limits. In those places, the
              limits apply to the fullest extent permitted, and the rest of
              these terms still stand (severability). Failure to enforce a term
              is not a waiver. You may not assign these terms without consent;
              we may assign them with the Service.
            </p>
            <p>
              These terms are governed by the laws applicable to the operator,
              without regard to conflict-of-law rules. Courts of competent
              jurisdiction may hear disputes. Nothing here waives any immunity
              or right that cannot be waived.
            </p>
          </section>

          <section id="changes" className="scroll-mt-4 space-y-3">
            <h2 className="text-xl text-ink">10. Changes, contact</h2>
            <p>
              We may change these terms by posting a new version on this page.
              Continued use after the update is posted is acceptance of the new
              terms. We may pause, move, or end the hosted desk at any time.
            </p>
            <p>
              Contact:{" "}
              <a
                href="https://github.com/dmscribe"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/dmscribe
              </a>
              . Author: Daniel Scribe, Pimicikamak Cree Nation, Turtle Island.
            </p>
            <p>Copyright (c) {year} Cree Sanctum Cryptographic Messenger</p>
          </section>
        </article>

        <p className="text-center text-sm text-muted">
          <Link to="/" className="underline underline-offset-2 hover:text-ink">
            Back to sign on
          </Link>
        </p>
      </div>
    </main>
  );
}
