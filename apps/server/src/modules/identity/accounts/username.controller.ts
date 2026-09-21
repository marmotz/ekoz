import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { OwnerGuard } from '../../../core/http/owner.guard.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import {
  type ChangeUsernameBody,
  ChangeUsernameDto,
  UsernameApprovedDto,
  UsernameChangeAppliedDto,
  UsernameChangePendingDto,
  UsernameChangeRequestDto,
  UsernameChangeStateDto,
} from './username.dto.js';
import {
  type UsernameChangeOutcome,
  type UsernameChangeState,
  UsernameService,
} from './username.service.js';

/**
 * `/me/username` — policy-driven identifier change (technical.md §17), its
 * current state and the cancellation of a pending request.
 */
@ApiTags('Username')
@ApiBearerAuth('bearer')
@Controller('me/username')
@UseGuards(AuthGuard)
export class MeUsernameController {
  constructor(private readonly usernames: UsernameService) {}

  @Get()
  @ApiOperation({ summary: 'Policy, cooldown end and pending request of the calling account.' })
  @ApiOkResponse({ type: UsernameChangeStateDto })
  @ApiProblemResponses()
  state(@CurrentPrincipal() principal: AuthPrincipal): Promise<UsernameChangeState> {
    return this.usernames.stateOf(principal.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Change the calling account’s identifier (policy-driven).' })
  @ApiBody({ type: ChangeUsernameDto })
  @ApiExtraModels(UsernameChangeAppliedDto, UsernameChangePendingDto)
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(UsernameChangeAppliedDto) },
        { $ref: getSchemaPath(UsernameChangePendingDto) },
      ],
    },
  })
  @ApiProblemResponses({ validation: true, statuses: [403, 409] })
  change(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(ChangeUsernameDto)) body: ChangeUsernameBody,
  ): Promise<UsernameChangeOutcome> {
    return this.usernames.changeOwn(principal.userId, body.name);
  }

  @Delete('request')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel the calling account’s pending identifier change request.' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [404] })
  cancelRequest(@CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.usernames.cancelOwnRequest(principal.userId);
  }
}

/**
 * Owner review of `approval`-mode identifier changes (technical.md §16, §17).
 */
@ApiTags('Username')
@ApiBearerAuth('bearer')
@Controller('admin/username-requests')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminUsernameRequestsController {
  constructor(private readonly usernames: UsernameService) {}

  @Get()
  @ApiOperation({ summary: 'List pending / resolved identifier-change requests.' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
  })
  @ApiOkResponse({ type: UsernameChangeRequestDto, isArray: true })
  @ApiProblemResponses({ statuses: [403] })
  list(@Query('status') status?: 'pending' | 'approved' | 'rejected' | 'cancelled') {
    return this.usernames.listRequests(status);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve an identifier-change request.' })
  @ApiOkResponse({ type: UsernameApprovedDto })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  approve(
    @Param('id') id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<{ identifier: string }> {
    return this.usernames.approve(id, principal.userId);
  }

  @Post(':id/reject')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reject an identifier-change request.' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [403, 404] })
  reject(@Param('id') id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.usernames.reject(id, principal.userId);
  }
}
