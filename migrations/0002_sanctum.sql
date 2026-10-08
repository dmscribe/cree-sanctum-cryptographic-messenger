-- Cree Sanctum schema. Ciphertext mailbox + identity bindings + PYMK stores.
-- Server never stores plaintext or private keys.

create table if not exists profiles (
  user_id text primary key,
  username text not null,
  display_name text not null,
  photo_hash text,
  photo_data text,
  age integer,
  gender text,
  description text not null default '',
  city text,
  workplace text,
  bubble text,
  aliases text not null default '',
  active boolean not null default true,
  deactivated boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  stealth boolean not null default false,
  discover_on boolean not null default true,
  history_enabled boolean not null default true,
  read_receipts_enabled boolean not null default true,
  full_links_allowed boolean not null default false,
  first_run_done boolean not null default false,
  mood_text text,
  mood_expires_at timestamptz,
  mood_voice_meta text,
  sanctum_public_key text,
  sanctum_key_updated_at timestamptz,
  openpgp_fingerprint text,
  openpgp_public_key text,
  device_binding_payload text,
  device_binding_signature text,
  kind text not null default 'user',
  owner_user_id text
);

create unique index if not exists profiles_username_idx on profiles (username);
create unique index if not exists profiles_fingerprint_idx on profiles (openpgp_fingerprint) where openpgp_fingerprint is not null;
create index if not exists profiles_active_idx on profiles (active, last_seen desc);
create index if not exists profiles_created_idx on profiles (created_at desc);
create index if not exists profiles_owner_idx on profiles (owner_user_id);

create table if not exists friendships (
  user_id text not null,
  friend_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create table if not exists friend_requests (
  id text primary key,
  from_id text not null,
  to_id text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists friend_requests_to_idx on friend_requests (to_id, status);

create table if not exists conversations (
  id text primary key,
  pair_key text not null unique,
  participant_a text not null,
  participant_b text not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_sender_id text
);
create index if not exists conversations_part_a_idx on conversations (participant_a, last_message_at desc);
create index if not exists conversations_part_b_idx on conversations (participant_b, last_message_at desc);

create table if not exists sanctum_messages (
  id text primary key,
  conversation_id text not null,
  sender_id text not null,
  recipient_id text not null,
  message_type text not null default 'text',
  ciphertext text not null,
  nonce text not null,
  eph_pub text not null,
  ciphertext_self text not null,
  nonce_self text not null,
  eph_pub_self text not null,
  media_refs text not null default '[]',
  read_receipt boolean not null default true,
  read boolean not null default false,
  read_at timestamptz,
  soft_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  audio_ciphertext text,
  audio_nonce text,
  audio_eph_pub text,
  audio_ciphertext_self text,
  audio_nonce_self text,
  audio_eph_pub_self text,
  audio_duration double precision
);
create index if not exists sanctum_messages_convo_idx on sanctum_messages (conversation_id, created_at);
create index if not exists sanctum_messages_inbox_idx on sanctum_messages (recipient_id, read, soft_deleted);
create index if not exists sanctum_messages_expire_idx on sanctum_messages (expires_at);

create table if not exists bans (
  viewer_id text not null,
  target_id text not null,
  kind text not null,
  permanent boolean not null default false,
  until timestamptz,
  created_at timestamptz not null default now(),
  primary key (viewer_id, target_id)
);

create table if not exists pair_store (
  lo_id text not null,
  hi_id text not null,
  search_ab integer not null default 0,
  search_ba integer not null default 0,
  open_ab integer not null default 0,
  open_ba integer not null default 0,
  dwell_ab integer not null default 0,
  dwell_ba integer not null default 0,
  unique_days integer not null default 0,
  last_event_ts bigint not null default 0,
  primary key (lo_id, hi_id)
);

create table if not exists touch_index (
  actor_id text not null,
  target_id text not null,
  last_ts bigint not null,
  primary key (actor_id, target_id)
);

create table if not exists discover_views (
  id text primary key,
  viewer_id text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists discover_views_target_idx on discover_views (target_id, created_at desc);
create index if not exists discover_views_viewer_idx on discover_views (viewer_id, created_at desc);

create table if not exists rate_limits (
  actor_id text not null,
  kind text not null,
  day_bucket text not null,
  count integer not null default 0,
  primary key (actor_id, kind, day_bucket)
);

create table if not exists activity_log (
  id text primary key,
  event_type text not null,
  key_id text,
  payload text not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists sanctum_reports (
  id text primary key,
  reporter_id text not null,
  reported_user_id text not null,
  conversation_id text,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
