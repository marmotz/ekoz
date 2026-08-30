import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

/**
 * Metrics side of observability (ADR 0020, technical.md §11): the OpenTelemetry
 * meter provider, the `MetricsService` wrapper and the `/metrics` endpoint.
 * Split from `ObservabilityModule` (logging) because it depends on
 * `ConfigService`, which itself depends on the database.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
