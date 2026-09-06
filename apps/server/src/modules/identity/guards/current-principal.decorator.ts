import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { UnauthenticatedError } from '../identity.errors.js';
import type { AuthenticatedRequest, AuthPrincipal } from './auth.guard.js';

/**
 * Injects the {@link AuthPrincipal} attached by {@link AuthGuard}. Throws if the
 * route is not actually guarded (a wiring bug, not a client error path).
 */
export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): AuthPrincipal => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.principal) {
    throw new UnauthenticatedError();
  }

  return request.principal;
});
