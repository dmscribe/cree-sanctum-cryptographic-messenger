# Cree Sanctum

Windowed messenger for sealed text and walkie-talkie voice. Device keys stay in the browser vault. The server stores ciphertext and routes it.

Daniel Scribe, Pimicikamak Cree Nation, Cross Lake, Manitoba. Living in Toronto, Ontario. October 2026.
https://github.com/dmscribe
https://www.linkedin.com/in/danielscribe/

This repository is the validation build for Cree Sanctum encrypted messaging, and a demonstration of a people-you-may-know ranking algorithm rebuilt from observed behavior. It is also the portfolio surface for the stack behind that work: C++, cryptography, and privacy.

The desk is named for the Navajo code talkers, and for the cypherpunk idea that the mail should be sealed before it leaves the machine.

Node 22.

    npm ci
    cp .env.example .env
    npm run dev

Open http://127.0.0.1:8080. Leave DATABASE_URL empty to use the embedded PGLite database.

Mail is P-256 ECIES, HKDF-SHA-256, AES-GCM. The ranking engine lives in libsuggest (C++) and src/lib/suggest (TypeScript). See docs/CRYPTO_AUDIT.md for the packet format and the limits.