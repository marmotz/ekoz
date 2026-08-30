import { Controller, Get } from '@nestjs/common';

/**
 * Liveness probe only: "the process is up", no dependencies checked
 * (technical.md §9). Readiness (`/readyz`) and the per-dependency breakdown are
 * delivered by task #11; this stub exists so the skeleton boots as a real HTTP
 * service and the e2e smoke test has a target.
 */
@Controller()
export class HealthController {
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
