import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import { SensitiveThrottleGuard } from './sensitive-throttle.guard.js';

const config = { get: () => ({ window: 900, max: 3 }) } as unknown as ConfigService;

function contextFor(body: Record<string, unknown>, ip = '10.0.0.1'): ExecutionContext {
  const request = { body, ip, method: 'POST', path: '/auth/login' };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SensitiveThrottleGuard', () => {
  it('allows up to `max` attempts per IP + target, then throws 429 with Retry-After', () => {
    const guard = new SensitiveThrottleGuard(config);
    const ctx = contextFor({ identifier: 'alice' });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);

    try {
      guard.canActivate(ctx);
      expect.unreachable('the 4th attempt must be throttled');
    } catch (error) {
      expect((error as { status: number }).status).toBe(429);
      expect((error as { headers: Record<string, string> }).headers['Retry-After']).toMatch(/^\d+$/);
    }
  });

  it('keeps counters separate per target and per IP', () => {
    const guard = new SensitiveThrottleGuard(config);

    for (let i = 0; i < 3; i += 1) {
      guard.canActivate(contextFor({ identifier: 'alice' }));
    }

    // A different target is unaffected.
    expect(guard.canActivate(contextFor({ identifier: 'bob' }))).toBe(true);
    // A different IP for the same target is unaffected.
    expect(guard.canActivate(contextFor({ identifier: 'alice' }, '10.0.0.2'))).toBe(true);
  });
});
