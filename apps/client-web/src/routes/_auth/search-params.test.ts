import { expect, it } from 'vitest';

import { Route as RegisterRoute } from '@/routes/_auth/register';
import { Route as ResetPasswordRoute } from '@/routes/_auth/reset-password';
import { Route as VerifyEmailRoute } from '@/routes/_auth/verify-email';

type Validate = (search: Record<string, unknown>) => Record<string, unknown>;

function validator(route: { options: { validateSearch?: unknown } }): Validate {
  const { validateSearch } = route.options;
  if (typeof validateSearch !== 'function') throw new Error('The route has no validateSearch');
  return validateSearch as Validate;
}

it.each([
  ['register', RegisterRoute, 'invite'],
  ['verify-email', VerifyEmailRoute, 'token'],
  ['reset-password', ResetPasswordRoute, 'token'],
] as const)('%s keeps `%s` as a string and drops everything else', (_name, route, key) => {
  const validate = validator(route);

  expect(validate({ [key]: 'abc', other: 'x' })).toEqual({ [key]: 'abc' });
  expect(validate({ [key]: '' })).toEqual({});
  expect(validate({ [key]: 42 })).toEqual({});
  expect(validate({ [key]: ['a', 'b'] })).toEqual({});
  expect(validate({})).toEqual({});
});
