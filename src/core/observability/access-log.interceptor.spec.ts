import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { runWithRequestContext } from '../http/request-context.js';
import { AccessLogInterceptor } from './access-log.interceptor.js';
import type { MetricsService } from './metrics.service.js';
import type { NestLoggerService } from './nest-logger.service.js';

function ctxFor(
  path: string,
  route?: string
): { context: ExecutionContext; res: EventEmitter & { statusCode: number } } {
  const res = Object.assign(new EventEmitter(), { statusCode: 200 });
  const req = { method: 'GET', path, route: route ? { path: route } : undefined };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { context, res };
}

const nextHandler: CallHandler = { handle: () => of('body') };

describe('AccessLogInterceptor (unit)', () => {
  it('emits exactly one line per completed request, on response finish', async () => {
    const info = vi.fn();
    const logger = { pino: { info } } as unknown as NestLoggerService;
    const metrics = { recordHttpRequest: vi.fn() } as unknown as MetricsService;
    const interceptor = new AccessLogInterceptor(logger, metrics);
    const { context, res } = ctxFor('/things/1', '/things/:id');

    await runWithRequestContext({ requestId: 'req-1', userId: 'u1' }, async () => {
      const obs = interceptor.intercept(context, nextHandler);
      await new Promise((resolve) => obs.subscribe({ complete: () => resolve(null) }));
    });
    expect(info).not.toHaveBeenCalled();

    res.statusCode = 404;
    res.emit('finish');

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]![0]).toMatchObject({
      route: '/things/:id',
      status: 404,
      requestId: 'req-1',
      userId: 'u1',
    });
    expect((metrics.recordHttpRequest as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      route: '/things/:id',
      status_class: '4xx',
    });
  });

  it.each(['/healthz', '/readyz', '/metrics'])('skips the probe/scrape path %s', (path) => {
    const info = vi.fn();
    const logger = { pino: { info } } as unknown as NestLoggerService;
    const interceptor = new AccessLogInterceptor(logger, null);
    const { context, res } = ctxFor(path);
    interceptor.intercept(context, nextHandler);
    res.emit('finish');
    expect(info).not.toHaveBeenCalled();
  });
});
