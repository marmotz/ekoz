import { describe, expect, it } from 'vitest';
import { AdminCreateUserBodySchema, AuthPolicySchema, LoginBodySchema } from './schemas.js';

describe('schemas', () => {
  it('accepts a valid AdminCreateUserBody payload', () => {
    const result = AdminCreateUserBodySchema.safeParse({
      name: 'jdoe',
      email: 'jdoe@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'John Doe',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an AdminCreateUserBody payload with an invalid email', () => {
    const result = AdminCreateUserBodySchema.safeParse({
      name: 'jdoe',
      email: 'not-an-email',
      password: 'correct-horse-battery-staple',
      displayName: 'John Doe',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an AdminCreateUserBody payload missing required fields', () => {
    const result = AdminCreateUserBodySchema.safeParse({
      email: 'jdoe@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid LoginBody payload', () => {
    const result = LoginBodySchema.safeParse({
      identifier: 'jdoe@example.com',
      password: 'correct-horse-battery-staple',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a LoginBody payload with an empty password', () => {
    const result = LoginBodySchema.safeParse({
      identifier: 'jdoe@example.com',
      password: '',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid AuthPolicy payload', () => {
    const result = AuthPolicySchema.safeParse({
      registrationMode: 'invite',
      emailVerificationRequired: true,
      passwordMinLength: 10,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an AuthPolicy payload with an unknown registration mode', () => {
    const result = AuthPolicySchema.safeParse({
      registrationMode: 'anyone',
      emailVerificationRequired: true,
      passwordMinLength: 10,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an AuthPolicy payload missing required fields', () => {
    const result = AuthPolicySchema.safeParse({ registrationMode: 'open' });

    expect(result.success).toBe(false);
  });
});
