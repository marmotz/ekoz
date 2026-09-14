import { typescriptGenerator } from '@kurotako/gen-typescript';
import { zodGenerator } from '@kurotako/gen-zod';
import { openapiParser } from '@kurotako/parser-openapi';
import { prismaParser } from '@kurotako/parser-prisma';
import { defineConfig } from 'kurotako';

// A generator entry's `name` must be unique across `generators` (kurotako
// enforces this to keep `outputs[].generators` unambiguous), so `zodGenerator`
// cannot be listed twice under its own name. `outputs[].generators` itself
// matches on each emitted file's `<namespace>/<segment>/…` path, and
// `zodGenerator` hardcodes that segment to `zod` regardless of the entry's
// `name` — so renaming alone still lets `db`'s `zod` files (Prisma,
// server-internal) leak into `packages/sdk/src/generated`. Wrap it to also
// rewrite the emitted path segment to `zod-api`, giving the `api` source a
// zod pass whose files are addressable only via `zod-api`, scoped to
// `packages/sdk/src/generated`.
const zodApiGenerator = {
  ...zodGenerator,
  name: 'zod-api',
  generate: async (...args: Parameters<typeof zodGenerator.generate>) => {
    const output = await zodGenerator.generate(...args);
    return {
      ...output,
      files: output.files.map((file) => {
        const segments = file.path.split('/');
        segments[1] = 'zod-api';
        return { ...file, path: segments.join('/') };
      }),
    };
  },
};

export default defineConfig({
  sources: {
    db: {
      use: prismaParser,
      options: {
        // Version-8 mode reads `contract.json` from this folder, not the `.prisma` source.
        schema: './apps/server/src/core/prisma',
        version: 8,
      },
    },
    api: {
      use: openapiParser,
      options: {
        document: './apps/server/openapi.json',
      },
    },
  },
  generators: [
    { use: zodGenerator, namespaces: ['db'] },
    { use: typescriptGenerator, namespaces: ['api'] },
    { use: zodApiGenerator, namespaces: ['api'] },
  ],
  outputs: [
    { dir: './apps/server/src/generated', generators: ['zod'] },
    { dir: './packages/sdk/src/generated', generators: ['typescript', 'zod-api'] },
  ],
});
