import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'ekoz:is-public';

/**
 * Marks a route (or a whole controller) as reachable without authentication.
 * The global guard baseline honours it; until `AuthGuard` lands in the identity
 * feature the guard allows everything anyway (ADR 0017, technical.md §10).
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
