import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Global guard baseline (ADR 0017, technical.md §10). It establishes the
 * `@Public()` seam and the single enforcement point now; the real check arrives
 * with `AuthGuard` in the identity feature. Until then every request is allowed.
 */
@Injectable()
export class BaselineAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read for its side effect of documenting the seam; result unused while the
    // baseline is allow-all.
    this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return true;
  }
}
