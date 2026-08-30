import { Injectable } from '@nestjs/common';
import { DomainError } from '../http/domain-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isParameterKey, parameterSpec, type ParameterKey } from './registry.js';

/**
 * Read/write access to the `settings` table (ADR 0009, technical.md §2). Only
 * `runtime` keys are allowed; values are validated against the registry schema
 * on write.
 *
 * Values are stored wrapped as `{ value: <x> }` to sidestep a Prisma 8 RC bug
 * where a bare JSON scalar in a `Jsonb` column fails to decode (see CHANGELOG
 * Notes for #2).
 */
@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All admin overrides, as a `key -> unwrapped value` map. */
  async loadAll(): Promise<Map<ParameterKey, unknown>> {
    const rows = (await this.prisma.orm.public.Setting.all()) as Array<{ key: string; value: unknown }>;
    const out = new Map<ParameterKey, unknown>();

    for (const row of rows) {
      if (isParameterKey(row.key)) out.set(row.key, unwrap(row.value));
    }

    return out;
  }

  /** Validate against the registry and upsert. Rejects `infra` and unknown keys. */
  async set(key: string, value: unknown, updatedBy: string | null): Promise<void> {
    if (!isParameterKey(key)) {
      throw new DomainError('config.unknown_key', `Unknown configuration key: ${key}`, 422);
    }

    const spec = parameterSpec(key);
    if (spec.kind !== 'runtime') {
      throw new DomainError(
        'config.not_runtime',
        `"${key}" is an infra parameter and cannot be set from the admin.`,
        422
      );
    }

    const parsed = spec.schema.safeParse(value);
    if (!parsed.success) {
      throw new DomainError(
        'config.invalid_value',
        `Invalid value for "${key}": ${parsed.error.issues[0]?.message}`,
        422
      );
    }

    const wrapped = { value: parsed.data };
    const existing = await this.prisma.orm.public.Setting.where({ key }).first();
    if (existing) {
      await this.prisma.orm.public.Setting.where({ key }).update({ value: wrapped, updatedBy });
    } else {
      await this.prisma.orm.public.Setting.create({ key, value: wrapped, updatedBy });
    }
  }

  /** Remove an override, reverting the key to file / default. */
  async clear(key: string): Promise<void> {
    if (!isParameterKey(key)) {
      return;
    }

    await this.prisma.orm.public.Setting.where({ key }).delete();
  }
}

function unwrap(stored: unknown): unknown {
  if (stored !== null && typeof stored === 'object' && 'value' in stored) {
    return (stored as { value: unknown }).value;
  }

  return stored;
}
