# Cryptographic audit

This document describes the cryptographic properties and residual risks of the
current product surface.

## Mailbox

Mailbox encryption uses P-256 ECDH, HKDF-SHA-256 with the
`cree-sanctum-ecies-v1` info label, and AES-GCM with a random 12-byte nonce.
Mailbox v1 packets omit additional authenticated data. Mailbox v2 packets use
the canonical ordered pair string documented in `src/lib/sanctum/protocol.ts`
as AES-GCM additional authenticated data. The row version selects the
decrypt path; v1 rows are never retrofitted with v2 AAD.

The server validates public keys and decoded ciphertext sizes, but cannot
validate plaintext. Human plaintext remains on device.

## Device binding

An Ed25519 signature covers the canonical device binding payload and the
published P-256 JWK. `publishKeys` checks the binding before accepting the
device key. Fingerprint comparison is a user-driven ritual and is not
automatically replaced by server trust.

## Identity backups and restore

New identity backups use v3 AES-GCM wrapping with a random salt and nonce.
Legacy v1 and v2 files remain importable. Existing weak passphrases are not
silently upgraded; the operator must export a new sealed backup.

Throwaway restore uses sixteen words from a 256-word list, providing 128 bits
of list entropy. Possession of the phrase is possession of the restore path.

## Key domains and storage

Human secrets live in the IndexedDB origin vault and are not written to server
tables. `ghost_vaults` is reserved for network servants, whose keys are kept in
a separate domain so servant compromise does not expose human device keys.

## Residuals

- There is no Double Ratchet or other post-compromise secrecy layer.
- The server still sees routing metadata and traffic timing.
- A recipient can create plaintext exports after decryption.
- GPS is client-attested and can be spoofed.
