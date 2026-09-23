import { describe, expect, it } from 'vitest';

import { validationMessage } from '@/shared/i18n/validation-message';

describe('validationMessage', () => {
  it.each([
    [{ code: 'too_small', origin: 'string', minimum: 1 }, { key: 'auth.errors.required' }],
    [
      { code: 'too_small', origin: 'string', minimum: 12 },
      { key: 'auth.errors.tooShort', values: { count: 12 } },
    ],
    [
      { code: 'too_big', origin: 'string', maximum: 64 },
      { key: 'auth.errors.tooLong', values: { count: 64 } },
    ],
    [{ code: 'invalid_format', format: 'email' }, { key: 'auth.errors.invalidEmail' }],
    [{ code: 'invalid_type' }, { key: 'auth.errors.required' }],
    [{ code: 'custom' }, { key: 'auth.errors.invalid' }],
    [{ code: 'custom', message: 'Passwords differ' }, { text: 'Passwords differ' }],
    ['Already a message', { text: 'Already a message' }],
    [null, { key: 'auth.errors.invalid' }],
  ])('translates %j', (issue, expected) => {
    expect(validationMessage(issue)).toEqual(expected);
  });
});
