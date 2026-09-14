import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { BaselineAuthGuard } from './baseline-auth.guard.js';
import { ProblemExceptionFilter } from './problem-exception.filter.js';
import { RequestContextMiddleware } from './request-context.middleware.js';

/**
 * Cross-cutting HTTP conventions (ADR 0017, technical.md §10): the per-request
 * `AsyncLocalStorage` context, the `application/problem+json` exception filter,
 * and the global guard baseline with the `@Public()` seam.
 *
 * `AuthGuard` / `OwnerGuard` live in this same directory but are wired by
 * {@link AuthGuardModule} instead, so a minimal test module that only needs
 * these conventions is not forced to also bind `PRINCIPAL_AUTHENTICATOR`
 * (`docs/technical/shared-auth-guard.md`).
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: ProblemExceptionFilter },
    { provide: APP_GUARD, useClass: BaselineAuthGuard },
  ],
})
export class HttpModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
