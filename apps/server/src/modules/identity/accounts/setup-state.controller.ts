import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SetupService, type SetupState } from '../../../core/bootstrap/setup.service.js';
import { Public } from '../../../core/http/public.decorator.js';
import { SetupStateDto } from './setup-state.dto.js';

/**
 * Public setup-state probe (technical.md §2.4, issue #15). Deliberately a
 * sibling of {@link SetupController} rather than a method on it: that one is
 * `@UseGuards(SetupGuard)`, which would answer `410 Gone` once setup closes —
 * this route must keep working forever so the console can branch before
 * anyone signs in. Never reveals the pinned email.
 */
@ApiTags('Setup')
@Controller('setup')
export class SetupStateController {
  constructor(private readonly setup: SetupService) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Whether setup is open, and how the first owner must be pinned.' })
  @ApiOkResponse({ type: SetupStateDto })
  async state(): Promise<{ state: SetupState }> {
    return { state: await this.setup.resolveState() };
  }
}
