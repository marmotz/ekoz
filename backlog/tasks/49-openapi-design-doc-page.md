# docs — OpenAPI: cross-cutting design page

**Status**: done
**Type**: docs
**Issue**: [#49](https://github.com/marmotz/ekoz/issues/49)

Reference: [server-openapi-doc technical design §6](../features/server-openapi-doc/technical.md),
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## To do

1. Add `docs/technical/openapi-description-and-sdk-types.md` (context / alternatives / consequences): the Zod-first server with no class DTOs, the `nestjs-zod` bridge and why it was chosen (or the manual `z.toJSONSchema` fallback if the spike went that way), the `/docs` + committed `openapi.json` + `tako check` pipeline, and the consequence that response shapes now have a single schema source consumed by kurotako for SDK types.
2. Link it from `docs/technical/README.md`.
3. Cross-reference `docs/technical/api-conventions.md` (problem+json) and `docs/technical/entity-identifier-format.md` (which already forward-references "the OpenAPI description" and the 26-char base32 id pattern).

## Dependencies

- [47-openapi-emit-script](47-openapi-emit-script.md)
