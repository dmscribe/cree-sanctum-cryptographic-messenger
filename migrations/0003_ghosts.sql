-- Network servants (not people). Keys for mirrors live server-side.
-- 14-hour unblock, pole exclusivity, regional networks.

alter table profiles add column if not exists servant_role text;
alter table profiles add column if not exists region text;
alter table profiles add column if not exists tribe_name text;
alter table profiles add column if not exists exclusive_group text;
alter table profiles add column if not exists exclusive_peer text;
alter table profiles add column if not exists network_id text;
alter table profiles add column if not exists latitude double precision;
alter table profiles add column if not exists longitude double precision;

create table if not exists ghost_vaults (
  user_id text primary key,
  private_jwk text not null,
  public_jwk text not null,
  secret_key_hex text not null,
  public_key_hex text not null,
  fingerprint text not null,
  armored text not null,
  binding_payload text not null,
  binding_signature text not null,
  created_at timestamptz not null default now()
);

create table if not exists network_memberships (
  user_id text not null,
  network_id text not null,
  joined_at timestamptz not null default now(),
  primary key (user_id, network_id)
);

create table if not exists algorithm_logs (
  id text primary key,
  viewer_id text not null,
  ghost_id text not null,
  seq integer not null,
  line text not null,
  created_at timestamptz not null default now()
);
create index if not exists algorithm_logs_viewer_idx on algorithm_logs (viewer_id, created_at desc);
