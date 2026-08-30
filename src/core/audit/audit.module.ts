import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/**
 * Global so any feature can inject `AuditService` to record security- and
 * compliance-relevant events (technical.md §8) without re-importing this module.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
