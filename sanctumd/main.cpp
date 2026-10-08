// sanctumd — thin C++17 daemon sketch.
// Web cockpit is the live preview. This binary documents the HTTP surface
// the C++ tree must expose: /sanctum/* mailbox + /sanctum/pgp/* + /v1/suggest.
// Author: Daniel Scribe (github.com/dmscribe).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright (c) 2026 Daniel Scribe. See LICENSE-MIT / LICENSE in the repo root.
#include "sanctum/sanctum.hpp"
#include "pgpbind/bind.hpp"
#include "suggest/suggest.hpp"
#include <iostream>

int main(int argc, char** argv) {
  std::cout << "sanctumd (Cree Sanctum Cryptographic Messaging)\n";
  std::cout << "voice_ttl_h=" << sanctum::kVoiceTtlHours << "\n";
  std::cout << "binding example: "
            << pgpbind::canonical_binding("ryder", "x", "y", "2026-01-01T00:00:00Z") << "\n";
  std::cout << "routes:\n";
  std::cout << "  PUT  /sanctum/keys\n";
  std::cout << "  GET  /sanctum/users/{id}/public-key   (additive pgp fields)\n";
  std::cout << "  PUT  /sanctum/pgp/identity\n";
  std::cout << "  POST /sanctum/messages                (ciphertext only)\n";
  std::cout << "  GET  /sanctum/conversations\n";
  std::cout << "  GET  /v1/suggest?viewer=\n";
  std::cout << "  POST /v1/events/open                  (Discover only)\n";
  if (argc > 1 && std::string(argv[1]) == "--self-test") {
    suggest::Engine e;
    std::cout << "engine users=" << e.users.size() << "\n";
  }
  return 0;
}
