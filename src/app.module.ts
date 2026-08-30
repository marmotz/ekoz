import { Module } from '@nestjs/common';
import { AuditModule } from './core/audit/audit.module.js';
import { ConfigModule } from './core/config/config.module.js';
import { HealthModule } from './core/health/health.module.js';
import { HttpModule } from './core/http/http.module.js';
import { MetricsModule } from './core/observability/metrics.module.js';
import { ObservabilityModule } from './core/observability/observability.module.js';
import { PrismaModule } from './core/prisma/prisma.module.js';

/**
 * Root module. `src/core/*` holds cross-cutting infrastructure; `src/modules/*`
 * will hold functional features (identity, conversations, ...), which talk to
 * each other only through explicit provider interfaces or events — never by
 * importing one another directly (enforced by `eslint-plugin-boundaries`).
 */
@Module({
  imports: [ObservabilityModule, HttpModule, PrismaModule, ConfigModule, MetricsModule, AuditModule, HealthModule],
})
export class AppModule {}
