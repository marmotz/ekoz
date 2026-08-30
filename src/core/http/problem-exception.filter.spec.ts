import { HttpException, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { NestLoggerService } from '../observability/nest-logger.service.js';
import { DomainError, ValidationFailedError } from './domain-error.js';
import { PROBLEM_JSON_CONTENT_TYPE, type ProblemDetails } from './problem-details.js';
import { ProblemExceptionFilter } from './problem-exception.filter.js';
import { runWithRequestContext } from './request-context.js';

function fakeHost(): { host: ArgumentsHost; sent: () => ProblemDetails; status: () => number; type: () => string } {
  let body: ProblemDetails = {} as ProblemDetails;
  let statusCode = 0;
  let contentType = '';
  const res = {
    status: (c: number) => {
      statusCode = c;
      return res;
    },
    type: (t: string) => {
      contentType = t;
      return res;
    },
    send: (b: ProblemDetails) => {
      body = b;
      return res;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  return { host, sent: () => body, status: () => statusCode, type: () => contentType };
}

const logger = { error: vi.fn() } as unknown as NestLoggerService;

describe('ProblemExceptionFilter (unit)', () => {
  const filter = new ProblemExceptionFilter(logger);

  it('renders a DomainError as problem+json with its code and status', () => {
    const f = fakeHost();
    filter.catch(new DomainError('identity.username_taken', 'That username is taken.', 409), f.host);
    expect(f.status()).toBe(409);
    expect(f.type()).toBe(PROBLEM_JSON_CONTENT_TYPE);
    expect(f.sent()).toMatchObject({ code: 'identity.username_taken', status: 409, detail: 'That username is taken.' });
  });

  it('renders a ValidationFailedError as 422 with the errors array', () => {
    const f = fakeHost();
    filter.catch(new ValidationFailedError([{ path: 'body.email', message: 'Invalid email' }]), f.host);
    expect(f.status()).toBe(422);
    expect(f.sent()).toMatchObject({
      code: 'validation_failed',
      errors: [{ path: 'body.email', message: 'Invalid email' }],
    });
  });

  it('maps a framework NotFoundException to a not_found problem', () => {
    const f = fakeHost();
    filter.catch(new NotFoundException('Cannot GET /nope'), f.host);
    expect(f.status()).toBe(404);
    expect(f.sent().code).toBe('not_found');
  });

  it('swallows unknown errors as internal_error 500 and logs the stack', () => {
    const f = fakeHost();
    filter.catch(new Error('boom'), f.host);
    expect(f.status()).toBe(500);
    expect(f.sent()).toMatchObject({ code: 'internal_error', detail: 'An unexpected error occurred.' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('stamps the requestId from the ambient context', () => {
    const f = fakeHost();
    runWithRequestContext({ requestId: 'req-42' }, () => {
      filter.catch(new HttpException('x', 400), f.host);
    });
    expect(f.sent().requestId).toBe('req-42');
  });
});
