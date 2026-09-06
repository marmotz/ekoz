import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../http/public.decorator.js';
import { type ReadinessReport, ReadinessService } from './readiness.service.js';

/**
 * Health probes. Both are public and excluded from the access log.
 *
 * `/healthz` is pure liveness — "the process is up", no dependency checks.
 *
 * `/readyz` runs the dependency checks and answers `503` with the failing ones when the server is not ready to serve.
 */
@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Public()
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('readyz')
  async readyz(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.readiness.check();
    res.status(report.status === 'ready' ? 200 : 503);

    return report;
  }
}
