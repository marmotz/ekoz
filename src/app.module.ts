import { Module } from '@nestjs/common';
import { HealthModule } from './core/health/health.module.js';
import { PrismaModule } from './core/prisma/prisma.module.js';

/**
 * Root module. `src/core/*` holds cross-cutting infrastructure; `src/modules/*`
 * will hold functional features (identity, conversations, ...), which talk to
 * each other only through explicit provider interfaces or events — never by
 * importing one another directly (enforced by `eslint-plugin-boundaries`).
 */
@Module({
  imports: [PrismaModule, HealthModule],
})
export class AppModule {}
