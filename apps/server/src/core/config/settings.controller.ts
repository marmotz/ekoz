import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuditMetadata, JsonValue } from '../audit/audit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ApiProblemResponses } from '../http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../http/auth.guard.js';
import { CurrentPrincipal } from '../http/current-principal.decorator.js';
import { OwnerGuard } from '../http/owner.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { ConfigService } from './config.service.js';
import {
  isParameterKey,
  PARAMETER_REGISTRY,
  type ParameterKey,
  parameterSpec,
} from './registry.js';
import {
  ConfigKeyParamSchema,
  type ConfigParameterView,
  ConfigParameterViewDto,
  type SetConfigParameter,
  SetConfigParameterDto,
} from './settings.dto.js';
import {
  ConfigLockedError,
  ConfigNotRuntimeError,
  ConfigUnknownKeyError,
} from './settings.errors.js';

function buildView(config: ConfigService, key: ParameterKey): ConfigParameterView {
  const spec = parameterSpec(key);
  const desc = config.describe(key);
  let schemaHint: unknown = null;
  try {
    schemaHint = z.toJSONSchema(spec.schema);
  } catch {
    schemaHint = null;
  }

  return {
    key,
    kind: spec.kind,
    value: desc.value,
    source: desc.source,
    locked: desc.locked,
    hotReloadable: desc.hotReloadable,
    secret: desc.secret,
    schemaHint,
  };
}

/**
 * Admin settings (technical.md §2, issue #145): every parameter's resolved
 * value and provenance, and runtime overrides through the `settings` table.
 * Owner only.
 */
@ApiTags('Admin settings')
@ApiBearerAuth('bearer')
@Controller('admin/settings')
@UseGuards(AuthGuard, OwnerGuard)
export class SettingsController {
  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Every parameter's resolved value, source and provenance." })
  @ApiOkResponse({ type: ConfigParameterViewDto, isArray: true })
  @ApiProblemResponses({ statuses: [403] })
  list(): ConfigParameterView[] {
    return (Object.keys(PARAMETER_REGISTRY) as ParameterKey[]).map((key) =>
      buildView(this.config, key),
    );
  }

  @Put(':key')
  @ApiOperation({ summary: 'Set a runtime override (audited).' })
  @ApiOkResponse({ type: ConfigParameterViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 409, 422] })
  async set(
    @Param(new ZodValidationPipe(ConfigKeyParamSchema)) params: { key: string },
    @Body(new ZodValidationPipe(SetConfigParameterDto)) body: SetConfigParameter,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ConfigParameterView> {
    const key = this.assertRuntimeKey(params.key);
    const before = this.config.describe(key);
    if (before.locked) {
      throw new ConfigLockedError(key);
    }

    await this.config.set(key, body.value, principal.userId);

    const after = this.config.describe(key);
    await this.recordChange(key, before, after);

    return buildView(this.config, key);
  }

  @Delete(':key')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revert a key to its file / default value (audited).' })
  @ApiProblemResponses({ statuses: [403, 409, 422] })
  async reset(
    @Param(new ZodValidationPipe(ConfigKeyParamSchema)) params: { key: string },
  ): Promise<void> {
    const key = this.assertRuntimeKey(params.key);
    const before = this.config.describe(key);
    if (before.locked) {
      throw new ConfigLockedError(key);
    }

    await this.config.clear(key);

    const after = this.config.describe(key);
    await this.recordChange(key, before, after);
  }

  private assertRuntimeKey(key: string): ParameterKey {
    if (!isParameterKey(key)) {
      throw new ConfigUnknownKeyError(key);
    }
    if (parameterSpec(key).kind !== 'runtime') {
      throw new ConfigNotRuntimeError(key);
    }

    return key;
  }

  private async recordChange(
    key: ParameterKey,
    before: { value: unknown },
    after: { value: unknown },
  ): Promise<void> {
    const metadata: AuditMetadata = {
      oldValue: before.value as JsonValue,
      newValue: after.value as JsonValue,
    };
    await this.audit.record({
      action: 'config.setting_changed',
      targetType: 'config',
      targetId: key,
      metadata,
    });
  }
}
