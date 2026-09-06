import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SetupGuard } from '../../../core/bootstrap/setup.guard.js';
import { Public } from '../../../core/http/public.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { type SetupOwnerBody, SetupOwnerSchema } from './setup.dto.js';
import { type SetupOwnerResult, SetupOwnerService } from './setup-owner.service.js';

/**
 * First-owner setup endpoint (technical.md §1, ADR 0010, issue #18). Guarded by
 * server-core's {@link SetupGuard}: once an owner exists the route is
 * `410 Gone`.
 */
@Controller('setup')
@UseGuards(SetupGuard)
export class SetupController {
  constructor(private readonly setupOwner: SetupOwnerService) {}

  @Post('owner')
  @Public()
  @HttpCode(201)
  createOwner(
    @Body(new ZodValidationPipe(SetupOwnerSchema)) body: SetupOwnerBody,
    @Req() request: Request,
  ): Promise<SetupOwnerResult> {
    return this.setupOwner.createFirstOwner(body, {
      userAgent: request.get('user-agent') ?? null,
      ip: request.ip ?? null,
    });
  }
}
