import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { ConfigService } from '../config/config.service.js';
import { Public } from '../http/public.decorator.js';
import { MetricsService } from './metrics.service.js';

/**
 * `GET /metrics` — Prometheus text exposition (ADR 0020, technical.md §11).
 *
 * - Disabled entirely unless `observability.metrics_enabled` → `404`.
 * - With `observability.metrics_token` set: requires `Authorization: Bearer <token>`.
 * - Without a token: served only to loopback / private-range clients.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Req() req: Request): Promise<string> {
    if (!this.config.get('observability.metrics_enabled')) {
      throw new NotFoundException('Cannot GET /metrics');
    }

    const token = this.config.get('observability.metrics_token');
    if (token) {
      const header = req.headers.authorization ?? '';
      const provided = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!provided || !timingSafeEqualStr(provided, token)) {
        throw new UnauthorizedException('A valid bearer token is required for /metrics');
      }
    } else if (!isPrivateClient(req.ip ?? req.socket.remoteAddress ?? '')) {
      throw new ForbiddenException(
        '/metrics is only served on a private interface unless a token is configured',
      );
    }

    return this.metrics.collect();
  }
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isPrivateClient(ip: string): boolean {
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '' ||
    addr.startsWith('10.') ||
    addr.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(addr) ||
    /^fd[0-9a-f]{2}:/i.test(addr)
  );
}
