import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ReadinessService } from './readiness.service.js';

/**
 * Health endpoints. `ReadinessService` depends on `PrismaService`, `SigningService` and the storage driver,
 * all provided by global modules.
 */
@Module({
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
