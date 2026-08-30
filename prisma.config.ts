import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import 'dotenv/config';

// Prisma 8 ("Prisma Next"). The CLI never auto-loads `.env`: `dotenv/config`
// above does it explicitly. The datasource URL lives only in the environment
// (infra parameter `database.url`), never in the contract.

export default definePrismaConfig({
  skills: {
    agents: ['agents'],
    check: true,
  },
  orm: ormConfig({
    contract: './src/core/prisma/contract.prisma',
    output: './src/core/prisma/generated',
    db: {
      connection: process.env['DATABASE_URL'],
    },
    migrations: {
      dir: './prisma/migrations',
    },
  }),
});
