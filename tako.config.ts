import { typescriptGenerator } from '@kurotako/gen-typescript';
import { zodGenerator } from '@kurotako/gen-zod';
import { openapiParser } from '@kurotako/parser-openapi';
import { prismaParser } from '@kurotako/parser-prisma';
import { defineConfig } from 'kurotako';

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
  ],
  outputs: [
    { dir: './apps/server/src/generated', generators: ['zod'] },
    { dir: './packages/sdk/src/generated', generators: ['typescript'] },
  ],
});
