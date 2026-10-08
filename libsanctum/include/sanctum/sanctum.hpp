#pragma once
// libsanctum — Cree Sanctum Cryptographic Messaging (layer A).
// Wire field names are frozen: ciphertext, nonce, eph_pub, *_self, audio_*.
// Server stores ciphertext only. Voice TTL 24h, not blockchain-anchored.
// Mailbox v2 authenticates UTF-8 `cree-sanctum-mailbox-v2|` plus the sorted pair id
// as AES-GCM AAD; v1 packets omit AAD and remain decryptable.
// Author: Daniel Scribe (github.com/dmscribe).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright (c) 2026 Daniel Scribe. See LICENSE-MIT / LICENSE in the repo root.
#include <cstdint>
#include <string>

namespace sanctum {

inline constexpr int kMaxCiphertextBytes = 100000;
inline constexpr int kMaxVoiceCiphertextBytes = 3000000;
inline constexpr int kMaxVoiceDurationSeconds = 90;
inline constexpr int kVoiceTtlHours = 24;
inline constexpr int kMoodTtlHours = 48;
inline constexpr const char* kECIESInfo = "cree-sanctum-ecies-v1";
inline constexpr const char* kMailboxAadPrefix = "cree-sanctum-mailbox-v2|";
inline constexpr const char* kMailboxAadPrefix = "cree-sanctum-mailbox-v2|";

struct EncryptedPacket {
  std::string ciphertext;
  std::string nonce;
  std::string eph_pub;
};

struct Message {
  std::string id;
  std::string conversation_id;
  std::string sender_id;
  std::string recipient_id;
  std::string message_type;  // "text" | "voice"
  EncryptedPacket to_recipient;
  EncryptedPacket to_self;
  EncryptedPacket audio_to_recipient;
  EncryptedPacket audio_to_self;
  double audio_duration = 0;
  std::string created_at;
  std::string expires_at;  // empty for text
};

inline bool voice_expired(const Message& m, const std::string& now_iso) {
  if (m.message_type != "voice") return false;
  if (m.expires_at.empty()) return false;
  return now_iso >= m.expires_at;
}

}  // namespace sanctum
