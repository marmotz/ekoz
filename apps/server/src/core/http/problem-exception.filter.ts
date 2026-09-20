import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { summarizeError } from '../observability/error-report.js';
import { NestLoggerService } from '../observability/nest-logger.service.js';
import { DomainError, ValidationFailedError } from './domain-error.js';
import { PROBLEM_JSON_CONTENT_TYPE, type ProblemDetails } from './problem-details.js';
import { getRequestId } from './request-context.js';

/**
 * Global exception filter: every error leaves the API as
 * `application/problem+json` (RFC 9457, ADR 0017, technical.md §10).
 *
 * - `DomainError` → its `code` / `status` / `detail`.
 * - `ValidationFailedError` → `422` + `errors` array.
 * - `HttpException` (framework 404, etc.) → a generic `http_error` problem.
 * - anything else → `500` `internal_error`, details swallowed, stack logged.
 */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: NestLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(exception);
    problem.requestId = getRequestId();

    if (problem.status >= 500) {
      this.logger.error(
        exception instanceof Error ? summarizeError(exception) : 'Unhandled exception',
        exception instanceof Error ? exception.stack : undefined,
        ProblemExceptionFilter.name,
      );
    }

    if (exception instanceof DomainError && exception.headers) {
      for (const [name, value] of Object.entries(exception.headers)) {
        res.setHeader(name, value);
      }
    }

    res.status(problem.status).type(PROBLEM_JSON_CONTENT_TYPE).send(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ValidationFailedError) {
      return {
        type: 'about:blank',
        title: exception.title ?? 'Unprocessable Entity',
        status: 422,
        detail: exception.detail,
        code: exception.code,
        errors: exception.issues,
      };
    }

    if (exception instanceof DomainError) {
      return {
        type: 'about:blank',
        title: exception.title ?? statusText(exception.status),
        status: exception.status,
        detail: exception.detail,
        code: exception.code,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: 'about:blank',
        title: statusText(status),
        status,
        detail: extractHttpDetail(exception),
        code: status === HttpStatus.NOT_FOUND ? 'not_found' : 'http_error',
      };
    }

    return {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
      code: 'internal_error',
    };
  }
}

function statusText(status: number): string {
  return (
    Object.entries(HttpStatus)
      .find(([, v]) => v === status)?.[0]
      ?.replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Error'
  );
}

function extractHttpDetail(exception: HttpException): string {
  const body = exception.getResponse();

  if (typeof body === 'string') {
    return body;
  }

  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;

    return Array.isArray(message) ? message.join('; ') : String(message);
  }

  return exception.message;
}
