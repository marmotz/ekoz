import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import {
  type ContactsQuery,
  ContactsQueryDto,
  type ContactsResponse,
  ContactsResponseDto,
} from './contacts.dto.js';
import { ContactsService } from './contacts.service.js';

@ApiTags('Conversations — contacts')
@ApiBearerAuth('bearer')
@Controller('me/contacts')
@UseGuards(AuthGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @ApiOperation({
    summary: 'Search the users sharing a room with the caller, to start a conversation.',
  })
  @ApiOkResponse({ type: ContactsResponseDto })
  @ApiProblemResponses({ validation: true, statuses: [] })
  search(
    @Query(new ZodValidationPipe(ContactsQueryDto)) query: ContactsQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContactsResponse> {
    return this.contacts.search(principal, query);
  }
}
