#pragma once
// libpgpbind — OpenPGP-shaped identity beside the mailbox (layer B).
// Canonical binding (UTF-8, no extra spaces):
//   sanctum-device-v1|{user_id}|{sanctum_jwk_x}|{sanctum_jwk_y}|{device_key_created_at}
// Secret keys never appear in network payloads.
// Author: Daniel Scribe (github.com/dmscribe).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright (c) 2026 Daniel Scribe. See LICENSE-MIT / LICENSE in the repo root.
#include <sstream>
#include <string>
#include <vector>

namespace pgpbind {

inline constexpr const char* kPrefix = "sanctum-device-v1";

inline std::string canonical_binding(const std::string& user_id,
                                     const std::string& x,
                                     const std::string& y,
                                     const std::string& created_at) {
  std::ostringstream os;
  os << kPrefix << '|' << user_id << '|' << x << '|' << y << '|' << created_at;
  return os.str();
}

inline bool jwk_matches_payload(const std::string& payload,
                                const std::string& x,
                                const std::string& y) {
  // payload: prefix|user|x|y|t
  std::vector<std::string> parts;
  std::string cur;
  for (char c : payload) {
    if (c == '|') {
      parts.push_back(cur);
      cur.clear();
    } else {
      cur.push_back(c);
    }
  }
  parts.push_back(cur);
  if (parts.size() != 5) return false;
  if (parts[0] != kPrefix) return false;
  return parts[2] == x && parts[3] == y;
}

// Returns false when a server-swapped JWK is presented with an old signature
// covering a different x/y. Caller must refuse to send.
inline bool accept_device_jwk(const std::string& payload,
                              const std::string& x,
                              const std::string& y) {
  return jwk_matches_payload(payload, x, y);
}

inline std::string group_fingerprint(const std::string& hex) {
  std::string out;
  for (size_t i = 0; i < hex.size(); ++i) {
    if (i && i % 4 == 0) out.push_back(' ');
    out.push_back(static_cast<char>(hex[i] >= 'a' && hex[i] <= 'z' ? hex[i] - 32 : hex[i]));
  }
  return out;
}

}  // namespace pgpbind
