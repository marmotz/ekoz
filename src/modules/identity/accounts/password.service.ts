import { Injectable } from '@nestjs/common';
import { hash, hashSync, verify } from '@node-rs/argon2';

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
