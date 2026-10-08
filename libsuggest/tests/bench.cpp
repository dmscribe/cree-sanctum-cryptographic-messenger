// libsuggest bench — throughput check for the PYMK ranking pipeline.
// Author: Daniel Scribe (github.com/dmscribe).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright (c) 2026 Daniel Scribe. See LICENSE-MIT / LICENSE in the repo root.
#include "suggest/suggest.hpp"
#include <chrono>
#include <iostream>

int main() {
  suggest::Engine e;
  const int N = 5000;
  int64_t t = 1'700'000'000'000LL;
  for (int i = 0; i < N; ++i) {
    suggest::User u;
    u.pubkey = "U" + std::to_string(i);
    u.name = "User " + std::to_string(i % 50);
    u.active = true;
    u.created_at = t - i * 1000;
    u.last_seen = t;
    e.upsert_user(u);
  }
  // A small friend cluster around U0
  for (int i = 1; i < 12; ++i) e.on_friend_accept("U0", "U" + std::to_string(i));
  auto start = std::chrono::steady_clock::now();
  auto slots = e.suggest("U0", t);
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
  std::cout << "N=" << N << " visited=" << e.visited << " slots=" << slots.size() << " ms=" << ms << "\n";
  if (e.visited >= N) {
    std::cerr << "FAIL: generate scanned |V|\n";
    return 1;
  }
  return 0;
}
