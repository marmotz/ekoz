import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AccessLogInterceptor } from './access-log.interceptor.js';
import { NestLoggerService } from './nest-logger.service.js';

/**
 * Emission side of observability (ADR 0020, technical.md §11): the `pino` logger
 * as the Nest logger and the one-line-per-request access log.
 *
 * Metrics (`/metrics`, `MetricsService`) and OpenTelemetry tracing are added by
 * `MetricsModule` / the OTel bootstrap in this same directory.
 */
@Global()
@Module({
  providers: [NestLoggerService, { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor }],
  exports: [NestLoggerService],
})
export class ObservabilityModule {}
