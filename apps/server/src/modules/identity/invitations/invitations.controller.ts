import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import { OwnerGuard } from '../guards/owner.guard.js';
import {
  CreatedInvitationDto,
  type CreateInvitationBody,
  CreateInvitationDto,
  InvitationViewDto,
} from './invitation.dto.js';
import {
  type CreatedInvitation,
  InvitationService,
  type InvitationView,
} from './invitation.service.js';

/**
 * Invitation management (technical.md §8, issue #15). Owners only for this
 * increment.
 */
@ApiTags('Invitations')
@ApiBearerAuth('bearer')
@Controller('invitations')
@UseGuards(AuthGuard, OwnerGuard)
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a registration invitation (token returned once).' })
  @ApiBody({ type: CreateInvitationDto })
  @ApiCreatedResponse({ type: CreatedInvitationDto })
  @ApiProblemResponses({ validation: true, statuses: [403] })
  async create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateInvitationDto)) body: CreateInvitationBody,
  ): Promise<CreatedInvitation> {
    const created = await this.invitations.create(principal.userId, {
      email: body.email ?? null,
      expiresInDays: body.expiresInDays ?? null,
    });

    await this.audit.record({
      action: 'identity.invitation_created',
      actorUserId: principal.userId,
      targetType: 'invitation',
      targetId: created.id,
      metadata: { email: body.email ?? null },
    });

    return created;
  }

  @Get()
  @ApiOperation({ summary: 'List invitations.' })
  @ApiOkResponse({ type: InvitationViewDto, isArray: true })
  @ApiProblemResponses({ statuses: [403] })
  list(): Promise<InvitationView[]> {
    return this.invitations.list();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke an invitation.' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [403, 404] })
  async revoke(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<void> {
    await this.invitations.revoke(id);
    await this.audit.record({
      action: 'identity.invitation_revoked',
      actorUserId: principal.userId,
      targetType: 'invitation',
      targetId: id,
    });
  }
}
