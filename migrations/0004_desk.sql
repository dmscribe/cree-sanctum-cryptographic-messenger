-- Desk presence. Humans on the contacts seat.
alter table profiles add column if not exists presence text not null default 'offline';
