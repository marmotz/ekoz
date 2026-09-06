import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ProblemDetailsDto } from './problem-details.dto.js';
import { PROBLEM_JSON_CONTENT_TYPE } from './problem-details.js';

const STATUS_DESCRIPTIONS: Record<number, string> = {
  400: 'Malformed request.',
  401: 'Missing or invalid access token.',
  403: 'Authenticated but not allowed.',
  404: 'Resource not found.',
  409: 'Conflict with the current resource state.',
  410: 'Resource permanently gone.',
  413: 'Payload too large.',
  422: 'Validation failed (`code = "validation_failed"`, with an `errors` array).',
  429: 'Rate limited.',
};

function problemResponse(status: number) {
  return ApiResponse({
    status,
    description: STATUS_DESCRIPTIONS[status] ?? 'Error.',
    content: {
      [PROBLEM_JSON_CONTENT_TYPE]: { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
    },
  });
}

/**
 * Declares the `application/problem+json` error responses a route can return.
 * `401` is always included (every non-`@Public()` route can return it); pass
 * `validation: true` for routes with a validated body, and list any other codes
 * the handler adds in `statuses`.
 *
 * Usage: `@ApiProblemResponses({ validation: true, statuses: [403, 404] })`.
 */
export function ApiProblemResponses(
  options: { auth?: boolean; validation?: boolean; statuses?: number[] } = {},
): MethodDecorator & ClassDecorator {
  const codes = new Set<number>(options.statuses ?? []);
  if (options.auth !== false) {
    codes.add(401);
  }
  if (options.validation) {
    codes.add(422);
  }

  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ...[...codes].sort((a, b) => a - b).map(problemResponse),
  );
}
