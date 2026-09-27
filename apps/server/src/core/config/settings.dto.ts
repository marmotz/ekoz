import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** One parameter's `describe()`, plus a JSON Schema hint for the admin UI (technical.md §2, issue #145). */
export const ConfigParameterViewSchema = z.object({
  key: z.string(),
  kind: z.enum(['infra', 'runtime']),
  /** The resolved value, or the secret mask (`ConfigService.describe`). */
  value: z.unknown(),
  source: z.enum(['default', 'file', 'settings', 'env']),
  /** `true` when an env override pins the value; the admin sees it read-only. */
  locked: z.boolean(),
  hotReloadable: z.boolean(),
  secret: z.boolean(),
  /** JSON Schema for the parameter's value, `null` when it could not be derived. */
  schemaHint: z.unknown().nullable(),
});
export type ConfigParameterView = z.infer<typeof ConfigParameterViewSchema>;
export class ConfigParameterViewDto extends createZodDto(ConfigParameterViewSchema) {}

export const SetConfigParameterSchema = z.object({ value: z.unknown() });
export type SetConfigParameter = z.infer<typeof SetConfigParameterSchema>;
export class SetConfigParameterDto extends createZodDto(SetConfigParameterSchema) {}

export const ConfigKeyParamSchema = z.object({ key: z.string().min(1) });
