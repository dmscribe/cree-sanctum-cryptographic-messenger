-- At most one pending request per directed pair. Re-open after unfriend
-- updates the existing row (insertRequest) instead of inserting a second
-- pending. Without this, a client could flood the inbox with duplicates.

create unique index if not exists friend_requests_pending_pair
  on friend_requests (from_id, to_id)
  where status = 'pending';
