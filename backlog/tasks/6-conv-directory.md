# server — conversations: public room directory

**Status**: todo
**Type**: backend
**Issue**: [#6](https://github.com/marmotz/ekoz/issues/6)

Reference: [../features/conversations/technical.md §8](../features/conversations/technical.md#8-directory).

## To do

1. `GET /directory?query=&cursor=` — public `channel` rooms only, keyset
   pagination (`rooms.directory_page_size`).
2. Search: PostgreSQL FTS (`to_tsvector(name || ' ' || topic)`, GIN index) +
   `pg_trgm` fallback for short prefixes. Raw SQL via Prisma `$queryRaw`.
3. Publish / unpublish = flip `visibility` public/private (needs
   `directory.publish`), emit `room_updated`.

## Dependencies

- 1-conv-room-model-and-hierarchy (done — `tasks/done/server-1-conv-room-model-and-hierarchy.md`)
- 3-conv-permission-model (done — `tasks/done/server-3-conv-permission-model.md`)
