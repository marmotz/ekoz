import { Injectable } from '@nestjs/common';
import { hash, hashSync, verify } from '@node-rs/argon2';
import { WeakPasswordError } from '../identity.errors.js';

/** Minimum password length (technical.md §8). */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * A small denylist of the most common weak passwords (technical.md §8). This is
 * deliberately tiny — a full breach-corpus check is out of scope; the length
 * floor does most of the work.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  'password1',
  'password123',
  '1234567890',
  '12345678901',
  'qwertyuiop',
  'letmein123',
  'iloveyou123',
  'adminadmin',
  'welcome123',
  'changeme123',
  'passw0rd123',
]);

/** `@node-rs/argon2` ships `Algorithm` as an ambient const enum (unusable under
 * `isolatedModules`); `2` is `Algorithm.Argon2id`. */
const ARGON2ID = 2;

/**
 * Password hashing (technical.md §6, ADR 0008).
 *
 * Argon2id via `@node-rs/argon2` (native, Bun-friendly). Parameters are the
 * OWASP baseline; they are embedded in the PHC string, so {@link needsRehash}
 * can detect a stored hash produced under a weaker policy and the login flow
 * transparently upgrades it.
 */
export const ARGON2_PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A real hash over a throwaway secret, computed once. Verified on unknown-user
 * logins so a missing account costs the same Argon2 work as a wrong password.
 */
let dummyHash: string | undefined;
function getDummyHash(): string {
  return (dummyHash ??= hashSync('ekoz-dummy-password', ARGON2_PARAMS));
}

@Injectable()
export class PasswordService {
  /**
   * Enforce the minimal registration password policy (technical.md §8): at
   * least {@link MIN_PASSWORD_LENGTH} characters and not one of a small set of
   * common passwords. Throws {@link WeakPasswordError} otherwise.
   */
  assertAcceptable(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    }

    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      throw new WeakPasswordError('This password is too common; choose a less predictable one.');
    }
  }

  /** Argon2id PHC hash of `password`. */
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_PARAMS);
  }

  /** `true` when `password` matches `storedHash`. Never throws on a bad hash. */
  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password, ARGON2_PARAMS);
    } catch {
      return false;
    }
  }

  /**
   * One Argon2 verification against a throwaway hash, for the "user not found"
   * branch of login — so a missing account and a wrong password cost the same.
   */
  async dummyVerify(): Promise<void> {
    try {
      await verify(getDummyHash(), 'not-the-password', ARGON2_PARAMS);
    } catch {
      // Result is discarded; the Argon2 work is the point.
    }
  }

  /** `true` when `storedHash` was produced under a policy weaker than the current one. */
  needsRehash(storedHash: string): boolean {
    const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
    if (!match) {
      return true;
    }

    const [memoryCost, timeCost, parallelism] = match.slice(1).map(Number) as [number, number, number];

    return (
      memoryCost < ARGON2_PARAMS.memoryCost ||
      timeCost < ARGON2_PARAMS.timeCost ||
      parallelism !== ARGON2_PARAMS.parallelism
    );
  }
}
