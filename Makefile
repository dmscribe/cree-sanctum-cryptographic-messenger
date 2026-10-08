# Cree Sanctum Cryptographic Messaging — C++ tree (libsanctum, libpgpbind, libsuggest, sanctumd).
# Author: Daniel Scribe (github.com/dmscribe).
# SPDX-License-Identifier: MIT OR Apache-2.0
# Copyright (c) 2026 Daniel Scribe. See LICENSE-MIT / LICENSE in the repo root.
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Ilibsanctum/include -Ilibpgpbind/include -Ilibsuggest/include

.PHONY: test bench sanctumd zip clean

test: libsuggest/tests/fixtures.cpp
	$(CXX) $(CXXFLAGS) -o /tmp/sanctum-fixtures libsuggest/tests/fixtures.cpp
	/tmp/sanctum-fixtures

bench: libsuggest/tests/bench.cpp
	$(CXX) $(CXXFLAGS) -o /tmp/sanctum-bench libsuggest/tests/bench.cpp
	/tmp/sanctum-bench

sanctumd: sanctumd/main.cpp
	$(CXX) $(CXXFLAGS) -o /tmp/sanctumd sanctumd/main.cpp

zip:
	mkdir -p public
	rm -f public/cree-sanctum-cpp.zip
	zip -r public/cree-sanctum-cpp.zip libsanctum libpgpbind libsuggest sanctumd Makefile README.md docs \
		-x "*.o"

clean:
	rm -f /tmp/sanctum-fixtures /tmp/sanctum-bench /tmp/sanctumd
