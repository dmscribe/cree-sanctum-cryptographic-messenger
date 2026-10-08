# Threat model

Cree Sanctum is a ciphertext messenger with device-held human keys,
server-held servant keys for network voices, and explicit contact discovery.
This document records product properties and residual risks.

## Trust boundaries

- Human device secrets remain in the browser's IndexedDB origin vault.
- The server stores ciphertext, nonces, ephemeral public keys, pair ids,
  timestamps, public identity material, and routing state.
- Network-servant private keys are stored in `ghost_vaults` in a separate key
  domain. That table is servant-only; a human device key must never be written
  there.

## Controls

- Mail uses P-256 ECIES, HKDF-SHA-256, and AES-GCM. Mailbox v2 authenticates
  the ordered conversation pair as AES-GCM additional authenticated data.
- `publishKeys` verifies the Ed25519 binding before accepting a device JWK.
- Human authorship is checked after decryption through the inner signature.
- Backup exports use v3 AES-GCM wrapping. Older v1 and v2 backups remain
  importable so existing seats are not stranded.
- The sixteen-word restore phrase uses a 256-word list and carries 128 bits of
  list entropy.
- GPS is client-attested and opt-in; the server receives only the selected
  coarse region.
- Fingerprint comparison is user-driven and remains the protection against a
  server-presented key swap.

## Residual risk

- The server learns communication participants, timing, packet sizes, and
  routing metadata.
- The browser vault is origin-bound rather than backed by an operating-system
  keychain.
- A stolen device key can read mail for that device until rotation.
- Anyone holding a restore phrase or legacy backup passphrase may restore a
  seat.
- Sanctum does not provide a session ratchet or post-compromise secrecy.
- A recipient can intentionally save plaintext after decryption.
- GPS claims can be spoofed by a compromised client.
