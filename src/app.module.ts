import { Module } from '@nestjs/common';
import { AuditModule } from './core/audit/audit.module.js';
import { BootstrapModule } from './core/bootstrap/bootstrap.module.js';
import { ConfigModule } from './core/config/config.module.js';
import { CryptoModule } from './core/crypto/crypto.module.js';
import { DiscoveryModule } from './core/discovery/discovery.module.js';
import { HealthModule } from './core/health/health.module.js';
import { HttpModule } from './core/http/http.module.js';
import { MailModule } from './core/mail/mail.module.js';
import { MetricsModule } from './core/observability/metrics.module.js';
import { ObservabilityModule } from './core/observability/observability.module.js';
import { PrismaModule } from './core/prisma/prisma.module.js';
import { StorageModule } from './core/storage/storage.module.js';
import { OwnerLookupModule } from './modules/identity/accounts/owner-lookup.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';

/**
 * Root module. `src/core/*` holds cross-cutting infrastructure; `src/modules/*`
 * will hold functional features (identity, conversations, ...), which talk to
 * each other only through explicit provider interfaces or events — never by
 * importing one another directly (enforced by `eslint-plugin-boundaries`).
 */
@Module({
  imports: [
    ObservabilityModule,
    HttpModule,
    PrismaModule,
    ConfigModule,
    CryptoModule,
    MetricsModule,
    AuditModule,
    StorageModule,
    MailModule,
    BootstrapModule,
    DiscoveryModule,
    HealthModule,
    IdentityModule,
    OwnerLookupModule,
  ],
})
export class AppModule {}
