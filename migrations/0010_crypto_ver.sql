-- Crypto version bump for mailbox packets.
-- v1: no AES-GCM additionalData. v2: additionalData = UTF-8("cree-sanctum-mailbox-v2|" + pairKey(a,b)).

alter table if exists sanctum_messages
  add column if not exists crypto_ver integer not null default 1;
