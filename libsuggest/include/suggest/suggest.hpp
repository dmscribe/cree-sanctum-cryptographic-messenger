#pragma once
// libsuggest — People You May Know. C++17 source of truth for layer C.
// Pipeline: GENERATE inventory → SCORE W/D → FILTER → SLOT 2 WARM + 7 DISCOVER.
// No all-pairs scan. No GPS. No scores on the client. No fake WARM seats.
// Chat/voice must never call on_open.
// Author: Daniel Scribe (github.com/dmscribe).
// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright (c) 2026 Daniel Scribe. See LICENSE-MIT / LICENSE in the repo root.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <map>
#include <set>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace suggest {

struct User {
  std::string pubkey;
  std::string name;
  int age = -1;
  std::string description;
  bool active = true;
  bool deactivated = false;
  bool stealth = false;
  int64_t last_seen = 0;
  int64_t created_at = 0;
  std::string city;
  std::string workplace;
  std::string bubble;
  std::vector<std::string> aliases;
  std::vector<std::string> friends;
  std::vector<std::string> in_req;
  std::vector<std::string> out_req;
};

struct Pair {
  uint16_t search_uv = 0, search_vu = 0;
  uint16_t open_uv = 0;
  uint32_t dwell_uv = 0;
  uint16_t unique_days = 0;
  int64_t last_event_ts = 0;
};

struct Slot {
  std::string pubkey;
  bool warm = false;
};

struct Ban {
  bool permanent = false;
  int64_t until = 0;
  std::string kind;
};

inline uint16_t sat_add_u16(uint16_t a, int b) {
  int s = static_cast<int>(a) + b;
  if (s > 65535) return 65535;
  if (s < 0) return 0;
  return static_cast<uint16_t>(s);
}

inline std::vector<std::string> tokenize(const std::string& s) {
  std::vector<std::string> out;
  std::string cur;
  for (char ch : s) {
    char c = ch;
    if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
      cur.push_back(c);
    } else {
      if (cur.size() >= 2) out.push_back(cur);
      cur.clear();
    }
  }
  if (cur.size() >= 2) out.push_back(cur);
  std::sort(out.begin(), out.end());
  out.erase(std::unique(out.begin(), out.end()), out.end());
  return out;
}

inline double jaccard(const std::vector<std::string>& a, const std::vector<std::string>& b) {
  if (a.empty() || b.empty()) return 0;
  std::unordered_set<std::string> sb(b.begin(), b.end());
  int inter = 0;
  std::unordered_set<std::string> un(a.begin(), a.end());
  for (auto& x : a)
    if (sb.count(x)) ++inter;
  for (auto& x : b) un.insert(x);
  return un.empty() ? 0 : static_cast<double>(inter) / static_cast<double>(un.size());
}

class Engine {
 public:
  std::unordered_map<std::string, User> users;
  std::map<std::pair<std::string, std::string>, Pair> pairs;
  std::unordered_map<std::string, std::set<std::string>> touches;
  std::unordered_map<std::string, std::vector<std::string>> tokens;
  std::unordered_map<std::string, Ban> bans;  // "a>b"
  std::unordered_map<std::string, int> rates;
  int visited = 0;

  static std::pair<std::string, std::string> canon(const std::string& a, const std::string& b) {
    return a < b ? std::make_pair(a, b) : std::make_pair(b, a);
  }

    void upsert_user(User u) {
    auto toks = tokenize(u.name + " " + u.description + " " + u.bubble);
    for (auto& al : u.aliases) {
      auto t2 = tokenize(al);
      toks.insert(toks.end(), t2.begin(), t2.end());
    }
    std::string id = u.pubkey;
    users[id] = std::move(u);
    for (auto& t : toks) tokens[t].push_back(id);
  }

  Pair& pair(const std::string& a, const std::string& b) { return pairs[canon(a, b)]; }

  bool quota(const std::string& actor, const std::string& kind, int64_t ts, int cap) {
    int day = static_cast<int>(ts / 86400000LL);
    std::string k = actor + "|" + kind + "|" + std::to_string(day);
    int n = rates[k];
    if (n >= cap) return false;
    rates[k] = n + 1;
    return true;
  }

  void on_search(const std::string& actor, const std::vector<std::string>& hits, int64_t ts) {
    if (!quota(actor, "search", ts, 40)) return;
    int n = 0;
    for (auto& t : hits) {
      if (t == actor) continue;
      if (n++ >= 20) break;
      auto c = canon(actor, t);
      auto& p = pairs[c];
      if (actor == c.first) p.search_uv = sat_add_u16(p.search_uv, 1);
      else p.search_vu = sat_add_u16(p.search_vu, 1);
      p.last_event_ts = ts;
      touches[actor].insert(t);
    }
  }

  void on_open(const std::string& actor, const std::string& target, int dwell_ms, int64_t ts) {
    if (actor == target) return;
    if (!quota(actor, "open", ts, 80)) return;
    auto c = canon(actor, target);
    auto& p = pairs[c];
    p.open_uv = sat_add_u16(p.open_uv, 1);
    p.dwell_uv += static_cast<uint32_t>(std::min(dwell_ms, 60000));
    p.unique_days = sat_add_u16(p.unique_days, 1);
    p.last_event_ts = ts;
    touches[actor].insert(target);
  }

  void on_friend_accept(const std::string& a, const std::string& b) {
    auto ia = users.find(a), ib = users.find(b);
    if (ia == users.end() || ib == users.end()) return;
    if (std::find(ia->second.friends.begin(), ia->second.friends.end(), b) == ia->second.friends.end())
      ia->second.friends.push_back(b);
    if (std::find(ib->second.friends.begin(), ib->second.friends.end(), a) == ib->second.friends.end())
      ib->second.friends.push_back(a);
  }

  void on_block(const std::string& viewer, const std::string& target) {
    bans[viewer + ">" + target] = Ban{true, 0, "block"};
    bans[target + ">" + viewer] = Ban{true, 0, "block"};
    auto ia = users.find(viewer), ib = users.find(target);
    if (ia != users.end()) {
      auto& f = ia->second.friends;
      f.erase(std::remove(f.begin(), f.end(), target), f.end());
    }
    if (ib != users.end()) {
      auto& f = ib->second.friends;
      f.erase(std::remove(f.begin(), f.end(), viewer), f.end());
    }
  }

  bool banned(const std::string& v, const std::string& t, int64_t now) const {
    auto it = bans.find(v + ">" + t);
    if (it == bans.end()) return false;
    if (it->second.permanent) return true;
    return it->second.until > now;
  }

  int mutuals(const std::string& u, const std::string& v) const {
    auto iu = users.find(u), iv = users.find(v);
    if (iu == users.end() || iv == users.end()) return 0;
    std::unordered_set<std::string> s(iv->second.friends.begin(), iv->second.friends.end());
    int n = 0;
    for (auto& f : iu->second.friends)
      if (s.count(f)) ++n;
    return n;
  }

  struct Dir {
    int in_s = 0, out_s = 0, opens = 0;
    double dwell_sec = 0;
    int64_t last = 0;
  };

  Dir directed(const std::string& u, const std::string& v) const {
    auto c = canon(u, v);
    auto it = pairs.find(c);
    Dir d;
    if (it == pairs.end()) return d;
    const Pair& p = it->second;
    if (u == c.first) {
      d.out_s = p.search_uv;
      d.in_s = p.search_vu;
    } else {
      d.out_s = p.search_vu;
      d.in_s = p.search_uv;
    }
    d.opens = p.open_uv;
    d.dwell_sec = p.dwell_uv / 1000.0;
    d.last = p.last_event_ts;
    return d;
  }

  std::vector<std::string> generate(const std::string& u) {
    visited = 0;
    std::vector<std::string> ids;
    std::set<std::string> seen;
    auto add = [&](const std::string& id) {
      if (id == u || seen.count(id)) return;
      seen.insert(id);
      ids.push_back(id);
      ++visited;
    };
    auto iu = users.find(u);
    if (iu == users.end()) return ids;
    const User& viewer = iu->second;
    std::unordered_map<std::string, int> fof;
    for (auto& f : viewer.friends) {
      auto it = users.find(f);
      if (it == users.end()) continue;
      for (auto& x : it->second.friends) {
        if (x == u) continue;
        fof[x]++;
        ++visited;
      }
    }
    std::vector<std::pair<int, std::string>> ranked;
    for (auto& kv : fof) ranked.push_back({kv.second, kv.first});
    std::sort(ranked.begin(), ranked.end(), [](auto& a, auto& b) { return a.first > b.first; });
    for (size_t i = 0; i < ranked.size() && i < 200; ++i) add(ranked[i].second);
    for (auto& t : touches[u]) add(t);
    auto nt = tokenize(viewer.name);
    int nh = 0;
    for (auto& t : nt) {
      auto it = tokens.find(t);
      if (it == tokens.end()) continue;
      int n = 0;
      for (auto& id : it->second) {
        if (n++ >= 64) break;
        add(id);
        if (++nh >= 200) break;
      }
      if (nh >= 200) break;
    }
    std::vector<const User*> act;
    for (auto& kv : users) {
      if (kv.second.active && !kv.second.deactivated && !kv.second.stealth && kv.first != u)
        act.push_back(&kv.second);
    }
    std::sort(act.begin(), act.end(), [](auto* a, auto* b) { return a->last_seen > b->last_seen; });
    for (size_t i = 0; i < act.size() && i < 40; ++i) add(act[i]->pubkey);
    std::vector<const User*> news;
    for (auto& kv : users)
      if (!kv.second.deactivated && !kv.second.stealth && kv.first != u) news.push_back(&kv.second);
    std::sort(news.begin(), news.end(), [](auto* a, auto* b) { return a->created_at > b->created_at; });
    for (size_t i = 0; i < news.size() && i < 16; ++i) add(news[i]->pubkey);
    size_t cap = users.size() <= 500 ? 256 : 1024;
    if (ids.size() > cap) ids.resize(cap);
    return ids;
  }

  double sim(const User& u, const User& v) const {
    auto tu = tokenize(u.name + " " + u.description + " " + u.bubble);
    auto tv = tokenize(v.name + " " + v.description + " " + v.bubble);
    return jaccard(tu, tv);
  }

  double score_W(const User& u, const User& v, int64_t now) const {
    auto d = directed(u.pubkey, v.pubkey);
    double decay = std::exp(-(now - (d.last ? d.last : now)) / (14.0 * 86400000.0));
    int mut = mutuals(u.pubkey, v.pubkey);
    int same_work = (!u.workplace.empty() && u.workplace == v.workplace) ? 1 : 0;
    int same_city = (!u.city.empty() && u.city == v.city) ? 1 : 0;
    double raw = 4 * std::log(1 + d.in_s) + 4 * std::log(1 + d.out_s) + 2 * std::log(1 + d.opens) +
                 std::log(1 + d.dwell_sec) + 5 * mut + 2 * same_work + 1.5 * same_city + 1 * sim(u, v);
    return raw * decay;
  }

  double score_D(const User& u, const User& v, int64_t now) const {
    double age_days = (now - v.created_at) / 86400000.0;
    double recency = std::max(0.0, (14.0 - age_days) / 14.0);
    int same_city = (!u.city.empty() && u.city == v.city) ? 1 : 0;
    double ab = 0;
    if (u.age >= 0 && v.age >= 0) {
      int d = std::abs(u.age - v.age);
      if (d <= 5) ab = 1;
      else if (d <= 10) ab = 0.5;
    }
    unsigned eps = 0;
    for (char c : u.pubkey + v.pubkey) eps = eps * 131u + static_cast<unsigned char>(c);
    double e = (eps % 1000) / 10000.0;
    return 0.35 * sim(u, v) + 0.20 * ab + 0.15 * (v.active ? 1.0 : 0) + 0.15 * recency + 0.15 * same_city + e;
  }

  bool warm_ok(const User& u, const User& v, int64_t now) const {
    if (v.deactivated || v.stealth) return false;
    if (std::find(u.friends.begin(), u.friends.end(), v.pubkey) != u.friends.end()) return false;
    if (banned(u.pubkey, v.pubkey, now)) return false;
    auto d = directed(u.pubkey, v.pubkey);
    int mut = mutuals(u.pubkey, v.pubkey);
    return (d.in_s + d.out_s + d.opens >= 3) || mut >= 1;
  }

  std::vector<Slot> suggest(const std::string& viewer, int64_t now) {
    std::vector<Slot> out;
    auto iu = users.find(viewer);
    if (iu == users.end() || iu->second.stealth || !iu->second.active) return out;
    const User& u = iu->second;
    auto inv = generate(viewer);
    struct Sc {
      const User* v;
      double W, D;
      bool warm;
    };
    std::vector<Sc> scored;
    for (auto& id : inv) {
      auto it = users.find(id);
      if (it == users.end()) continue;
      const User& v = it->second;
      if (v.pubkey == viewer || v.deactivated || v.stealth) continue;
      if (std::find(u.friends.begin(), u.friends.end(), v.pubkey) != u.friends.end()) continue;
      if (banned(viewer, v.pubkey, now)) continue;
      scored.push_back(Sc{&v, score_W(u, v, now), score_D(u, v, now), warm_ok(u, v, now)});
    }
    std::vector<Sc> warm, disc;
    for (auto& s : scored)
      if (s.warm) warm.push_back(s);
      else disc.push_back(s);
    std::sort(warm.begin(), warm.end(), [](auto& a, auto& b) { return a.W > b.W; });
    std::sort(disc.begin(), disc.end(), [](auto& a, auto& b) { return a.D > b.D; });
    if (warm.size() > 2) warm.resize(2);
    size_t need = 9 - warm.size();
    if (disc.size() > need) disc.resize(need);
    for (auto& s : warm) out.push_back(Slot{s.v->pubkey, true});
    for (auto& s : disc) out.push_back(Slot{s.v->pubkey, false});
    return out;
  }
};

}  // namespace suggest
