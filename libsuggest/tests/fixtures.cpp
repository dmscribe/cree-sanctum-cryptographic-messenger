// libsuggest fixtures — correctness checks for the WARM/DISCOVER pipeline.
// Author: Daniel Scribe (github.com/dmscribe).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright (c) 2026 Daniel Scribe. See LICENSE-MIT / LICENSE in the repo root.
#include "suggest/suggest.hpp"
#include "pgpbind/bind.hpp"
#include "sanctum/sanctum.hpp"
#include <cassert>
#include <chrono>
#include <iostream>

using namespace suggest;

static User mk(const std::string& id, const std::string& name, int64_t created = 0) {
  User u;
  u.pubkey = id;
  u.name = name;
  u.created_at = created;
  u.last_seen = created + 10;
  u.active = true;
  return u;
}

int main() {
  Engine e;
  int64_t t0 = 1'700'000'000'000LL;
  e.upsert_user(mk("U", "Una"));
  e.upsert_user(mk("SUP", "Support"));
  auto ar = mk("AR", "Aria");
  ar.aliases = {"Ma Jin"};
  e.upsert_user(ar);
  e.upsert_user(mk("CCS", "Cass"));
  auto hub = mk("HUB", "Hub");
  e.upsert_user(hub);
  e.on_friend_accept("U", "HUB");
  e.on_friend_accept("HUB", "SUP");  // FoF path
  // Warmth: three search/open events on SUP
  e.on_search("U", {"SUP"}, t0);
  e.on_search("U", {"SUP"}, t0 + 1000);
  e.on_open("U", "SUP", 400, t0 + 2000);
  // AR: several searches so W sits between SUP and CCS
  e.on_search("U", {"AR"}, t0);
  e.on_search("U", {"AR"}, t0 + 400);
  e.on_search("U", {"AR"}, t0 + 800);
  e.on_open("U", "AR", 200, t0 + 900);
  // CCS: one short search — not warm_ok, lowest W
  e.on_search("U", {"CCS"}, t0);

  auto slots = e.suggest("U", t0 + 3000);
  bool warm_sup = false, warm_ccs = false;
  for (auto& s : slots) {
    if (s.pubkey == "SUP" && s.warm) warm_sup = true;
    if (s.pubkey == "CCS" && s.warm) warm_ccs = true;
  }
  assert(warm_sup && "t0: WARM includes SUP");
  assert(!warm_ccs && "t0: CCS not WARM");

  const User& u = e.users["U"];
  double w_sup = e.score_W(u, e.users["SUP"], t0 + 3000);
  double w_ar = e.score_W(u, e.users["AR"], t0 + 3000);
  double w_ccs = e.score_W(u, e.users["CCS"], t0 + 3000);
  assert(w_sup > w_ar && w_ar > w_ccs && "t1: W(SUP) > W(AR) > W(CCS)");

  e.on_block("U", "SUP");
  auto after = e.suggest("U", t0 + 4000);
  bool sup_gone = true, ar_present = false;
  for (auto& s : after) {
    if (s.pubkey == "SUP") sup_gone = false;
    if (s.pubkey == "AR") ar_present = true;
  }
  assert(sup_gone && "t2: block SUP → SUP gone");
  assert(ar_present && "t2: AR promotes");

  // one long open on a stranger ≠ WARM
  e.upsert_user(mk("STR", "Stranger"));
  e.on_open("U", "STR", 120000, t0 + 5000);
  auto s2 = e.suggest("U", t0 + 6000);
  for (auto& s : s2) assert(!(s.pubkey == "STR" && s.warm));

  // quota: 10k bot searches stay inside 40
  Engine bot;
  bot.upsert_user(mk("B", "Bot"));
  bot.upsert_user(mk("T", "Target"));
  for (int i = 0; i < 10000; ++i) bot.on_search("B", {"T"}, t0);
  auto c = bot.canon("B", "T");
  assert(bot.pairs[c].search_uv <= 40);

  // ban not in pair rows
  assert(e.pairs.find(e.canon("U", "SUP")) != e.pairs.end());
  assert(e.bans.count("U>SUP"));

  // 50 similar-named family, no city: 9 cards, 0 WARM
  Engine fam;
  fam.upsert_user(mk("F0", "Family Root"));
  for (int i = 1; i <= 50; ++i) fam.upsert_user(mk("F" + std::to_string(i), "Family Kin " + std::to_string(i), t0 + i));
  auto fs = fam.suggest("F0", t0 + 100);
  assert(fs.size() <= 9);
  int wcount = 0;
  for (auto& s : fs)
    if (s.warm) ++wcount;
  assert(wcount == 0);

  // binding: flipped JWK rejected
  auto payload = pgpbind::canonical_binding("u1", "AAA", "BBB", "t");
  assert(pgpbind::accept_device_jwk(payload, "AAA", "BBB"));
  assert(!pgpbind::accept_device_jwk(payload, "AAA", "CCC"));  // y flipped
  assert(sanctum::kVoiceTtlHours == 24);

  // stealth viewer gets nothing
  e.users["U"].stealth = true;
  auto dark = e.suggest("U", t0 + 7000);
  assert(dark.empty());

  std::cout << "fixtures ok, visited=" << e.visited << "\n";
  return 0;
}
