-- Ghost || command: arm a notification ping that fires after the room closes.

create table if not exists ghost_pings (
  id text primary key,
  ghost_id text not null,
  user_id text not null,
  conversation_id text not null,
  command_text text not null,
  status text not null default 'waiting_close',
  fire_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ghost_pings_user_status_idx on ghost_pings (user_id, status, fire_at);
