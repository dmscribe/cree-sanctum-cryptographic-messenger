# Cree Sanctum Cryptographic Messaging — Project Map

Author: **Daniel Scribe** — [github.com/dmscribe](https://github.com/dmscribe)

The detailed file-by-file map lives at [`/PROJECTMAP.TXT`](../PROJECTMAP.TXT).
This page states the system shape at a glance.

## Product shape

Cree Sanctum is a windowed cryptographic messenger with sealed text, sealed
walkie-talkie voice, exact username lookup, an optional Discover radar, and a
separate network-servant domain for regional and pole voices.

## Main layers

| Path | Layer | Role |
| --- | --- | --- |
| `libsanctum/` | A | C++17 message types, voice TTL, size caps |
| `libpgpbind/` | B | Canonical device binding, fingerprint grouping |
| `libsuggest/` | C | Discover scoring and slot selection |
| `sanctumd/` | A–C | Thin C++ daemon surface (`/sanctum/*`, `/v1/*`) |
| `src/` | A–C | Desk UI, routes, crypto wrappers, server helpers |
| `docs/` | — | Threat model, crypto audit, maps, diagrams |
| `migrations/0002_sanctum.sql` | store | Profiles, ciphertext mailbox, pair store |

## Data stores

- `sanctum_messages`: ciphertext mailbox packets and metadata.
- `profiles`: public identity material, bindings, and seat profile state.
- `pair_store`, `touch_index`, `bans`, `discover_views`: Discover and ranking
  state.
- `ghost_vaults`, `network_memberships`, `algorithm_logs`: network-servant key
  domain and radar behavior.

## Trust boundaries

- Human device secrets stay in the browser vault.
- Human message bodies are sealed before they leave the device.
- The server stores ciphertext packets, public identity material, timestamps,
  and graph edges.
- Servant private keys live server-side in `ghost_vaults` so network voices can
  decrypt and reply inside their own domain.

## Build targets

- Web desk: `npm run dev`, `npm run build`
- Native tests: `make test`
- Native bench: `make bench`
- Downloadable native tree: `public/cree-sanctum-cpp.zip`

## Product rules

- Stealth turns Discover off without removing existing threads.
- Voice clips expire after 24 hours.
- Discover training comes from Discover opens rather than chat opens.
- Username lookup is exact.
