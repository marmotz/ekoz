import { zodGenerator } from '@kurotako/gen-zod';
import { prismaParser } from '@kurotako/parser-prisma';
import { defineConfig } from 'kurotako';

export default defineConfig({
  sources: {
    db: {
      use: prismaParser,
      options: {
        schema: './apps/server/src/core/prisma/contract.prisma',
        version: 8,
      },
    },
  },
  generators: [{ use: zodGenerator }],
  outputs: [{ dir: './apps/server/src/generated' }],
});
