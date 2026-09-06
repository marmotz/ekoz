# server — conversations: public room directory

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#29](https://github.com/ekoz-chat/server/issues/29)

Reference: [../features/conversations/technical.md §8](../features/conversations/technical.md#8-directory).

## To do

1. `GET /directory?query=&cursor=` — public `channel` rooms only, keyset
   pagination (`rooms.directory_page_size`).
2. Search: PostgreSQL FTS (`to_tsvector(name || ' ' || topic)`, GIN index) +
   `pg_trgm` fallback for short prefixes. Raw SQL via Prisma `$queryRaw`.
3. Publish / unpublish = flip `visibility` public/private (needs
   `directory.publish`), emit `room_updated`.

## Dependencies

- [24-conv-room-model-and-hierarchy](24-conv-room-model-and-hierarchy.md)
- [26-conv-permission-model](26-conv-permission-model.md)
