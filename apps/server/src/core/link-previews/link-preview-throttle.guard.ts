import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import type { AuthenticatedRequest } from '../http/principal-authenticator.js';
import { LinkPreviewTooManyRequestsError } from './link-preview.errors.js';

interface Window {
  count: number;
  startedAt: number;
}

/**
 * Per-user throttle for `POST /link-previews` (technical.md §S10), same
 * fixed-window mechanism as `SensitiveThrottleGuard` but keyed by the
 * authenticated `userId` instead of client IP + target. Runs after
 * `AuthGuard`, which populates `request.principal`.
 */
@Injectable()
export class LinkPreviewThrottleGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { window, max } = this.config.get('link_previews.throttle');
    const windowMs = window * 1000;
    const now = Date.now();

    this.sweep(now, windowMs);

    const key = request.principal?.userId ?? 'unknown';
    const entry = this.windows.get(key);

    if (!entry || now - entry.startedAt >= windowMs) {
      this.windows.set(key, { count: 1, startedAt: now });
      return true;
    }

    entry.count += 1;
    if (entry.count > max) {
      throw new LinkPreviewTooManyRequestsError((entry.startedAt + windowMs - now) / 1000);
    }

    return true;
  }

  private sweep(now: number, windowMs: number): void {
    if (this.windows.size < 1024) return;
    for (const [key, entry] of this.windows) {
      if (now - entry.startedAt >= windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
