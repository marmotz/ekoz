import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '../../../core/config/config.service.js';
import { TooManyRequestsError } from '../identity.errors.js';

interface Window {
  count: number;
  startedAt: number;
}

/**
 * Narrow, self-contained abuse guard for the credential endpoints (technical.md
 * §14, issue #22).
 *
 * This is a **deliberate minimal exception** to "general rate limiting is
 * deferred": a fixed-window, in-memory (per-instance) counter keyed by client
 * IP plus the target identifier/email. It is not the general rate-limiting
 * framework — that still comes later. Over the limit → `429` problem+json with
 * `Retry-After`.
 *
 * Applied to `POST /auth/login`, `/auth/register`,
 * `/auth/password-reset/request` and `/auth/verify-email/resend`.
 */
@Injectable()
export class SensitiveThrottleGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const { window, max } = this.config.get('auth.sensitive_throttle');
    const windowMs = window * 1000;
    const now = Date.now();

    this.sweep(now, windowMs);

    const key = this.keyFor(request);
    const entry = this.windows.get(key);

    if (!entry || now - entry.startedAt >= windowMs) {
      this.windows.set(key, { count: 1, startedAt: now });

      return true;
    }

    entry.count += 1;
    if (entry.count > max) {
      throw new TooManyRequestsError((entry.startedAt + windowMs - now) / 1000);
    }

    return true;
  }

  private keyFor(request: Request): string {
    // Keyed by client IP + target only (technical.md §14): one shared counter
    // across all four throttled endpoints, so hammering the same account from
    // `/auth/login` and `/auth/register` cannot double the budget.
    const body = (request.body ?? {}) as Record<string, unknown>;
    const rawTarget = body['identifier'] ?? body['email'] ?? '';
    const target = String(rawTarget).normalize('NFC').trim().toLowerCase();

    return `${request.ip ?? 'unknown'} ${target}`;
  }

  private sweep(now: number, windowMs: number): void {
    if (this.windows.size < 1024) {
      return;
    }

    for (const [key, entry] of this.windows) {
      if (now - entry.startedAt >= windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
