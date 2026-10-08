-- Directed edge list on each node. Friends, blocks, removed (composer greyed),
-- and “found via Discover / found via username” live on this edge — not a
-- second social graph.

alter table friend_requests add column if not exists source text not null default 'username';

alter table friendships add column if not exists request_source text;
alter table friendships add column if not exists messaging boolean not null default true;
alter table friendships add column if not exists removed boolean not null default false;
alter table friendships add column if not exists blocked boolean not null default false;

create index if not exists friend_requests_from_idx on friend_requests (from_id, status);
create index if not exists friendships_removed_idx on friendships (user_id, removed, blocked);
