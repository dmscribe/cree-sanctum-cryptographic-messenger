-- Unsigned seats, findability, GPS consent, gravelogs, sealed legal ledger.
-- Operator lat/long is never stored. Ledger rows are ciphertext only.

alter table profiles add column if not exists username_claimed boolean not null default false;
alter table profiles add column if not exists throwaway boolean not null default false;
alter table profiles add column if not exists gps_consent boolean not null default false;
alter table profiles add column if not exists location_mode text not null default 'stated';
alter table profiles add column if not exists stated_location text;
alter table profiles add column if not exists device_admin1 text;
alter table profiles add column if not exists device_country text;

create table if not exists gravelogs (
  id text primary key,
  username text not null,
  username_claimed boolean not null default false,
  laid_down_at timestamptz not null default now(),
  last_active_at timestamptz,
  reason text not null,
  user_id_hash text not null
);
create unique index if not exists gravelogs_username_claimed_idx
  on gravelogs (username) where username_claimed = true;
create index if not exists gravelogs_laid_idx on gravelogs (laid_down_at desc);

create table if not exists legal_ledger (
  id text primary key,
  created_at timestamptz not null default now(),
  ciphertext text not null,
  nonce text not null,
  eph_pub text not null,
  event_hash text not null,
  archived boolean not null default false
);
create index if not exists legal_ledger_hot_idx on legal_ledger (created_at) where archived = false;

create table if not exists conversation_stamps (
  id text primary key,
  message_id text not null,
  conversation_id text not null,
  event_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists conversation_stamps_msg_idx on conversation_stamps (message_id);

create table if not exists ledger_archives (
  id text primary key,
  created_at timestamptz not null default now(),
  gzip_b64 text not null,
  row_count integer not null,
  from_ts timestamptz,
  to_ts timestamptz
);

create table if not exists activity_log_archive (
  id text primary key,
  created_at timestamptz not null default now(),
  gzip_b64 text not null,
  row_count integer not null
);
