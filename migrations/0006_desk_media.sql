-- Pictures/video (encrypted blobs in audio_* fields), receive toggle,
-- typing pulses, IP abuse watch, starter-ghost deletes.

alter table profiles add column if not exists receive_media boolean not null default true;

create table if not exists typing_pulses (
  actor_id text not null,
  peer_id text not null,
  kind text not null,
  until timestamptz not null,
  primary key (actor_id, peer_id)
);

create table if not exists ip_watch (
  ip_hash text not null,
  kind text not null,
  window_start timestamptz not null default now(),
  hits integer not null default 0,
  banned_until timestamptz,
  primary key (ip_hash, kind)
);
create index if not exists ip_watch_ban_idx on ip_watch (banned_until);
