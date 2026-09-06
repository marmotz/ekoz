import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { IdentifierInvalidError, IdentifierUnavailableError } from '../identity.errors.js';

/**
 * Identifier rules (technical.md §5, ADR 0007).
 *
 * `name` is the local half of the canonical `name/server` identifier: lowercase,
 * NFC-normalised, `[a-z0-9_.-]`, 1-64 chars, no leading/trailing `_ . -`. It is
 * unrelated to the display name and is stored already normalised.
 */
@Injectable()
export class IdentifierService {
  /** 1-64 chars, alnum boundaries, `_ . -` allowed only in the interior. */
  static readonly PATTERN = /^[a-z0-9](?:[a-z0-9_.-]{0,62}[a-z0-9])?$/;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Trim, NFC, lowercase. Pure — no validation. */
  normalize(raw: string): string {
    return raw.normalize('NFC').trim().toLowerCase();
  }

  /**
   * Normalise `raw`, then reject it if it fails the pattern or is in
   * `identity.reserved_usernames`. Returns the normalised form.
   */
  validate(raw: string): string {
    const name = this.normalize(raw);

    if (!IdentifierService.PATTERN.test(name)) {
      throw new IdentifierInvalidError();
    }

    if (this.reservedNames().has(name)) {
      throw new IdentifierUnavailableError('This username is reserved.');
    }

    return name;
  }

  /**
   * Availability (technical.md §5): not held by an `active` / `suspended`
   * account and not in `reserved_username` with `reservedUntil > now()`.
   * Expects an already-normalised `name`.
   */
  async isAvailable(name: string): Promise<boolean> {
    const holder = (await this.prisma.orm.public.User.where({ name })
      .where((u) => u.status.neq('deleted'))
      .first()) as { id: string } | null;
    if (holder) {
      return false;
    }

    const reservation = (await this.prisma.orm.public.ReservedUsername.where({ name }).first()) as {
      reservedUntil: string;
    } | null;

    return !reservation || Date.parse(reservation.reservedUntil) <= Date.now();
  }

  /** `validate` + availability, throwing {@link IdentifierUnavailableError} otherwise. */
  async assertAvailable(raw: string): Promise<string> {
    const name = this.validate(raw);
    if (!(await this.isAvailable(name))) {
      throw new IdentifierUnavailableError();
    }

    return name;
  }

  private reservedNames(): Set<string> {
    return new Set(this.config.get('identity.reserved_usernames').map((n) => this.normalize(n)));
  }
}
