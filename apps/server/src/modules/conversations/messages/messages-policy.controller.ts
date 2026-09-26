import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '../../../core/config/config.service.js';
import { Public } from '../../../core/http/public.decorator.js';
import { type MessagesPolicyBody, MessagesPolicyDto } from './messages-policy.dto.js';

/**
 * Public messages policy probe. The limit is hot-reloadable, so it is read from
 * {@link ConfigService} on every call and never cached (`no-store`). Nothing
 * secret is exposed: the limit is observable by sending a long message.
 */
@ApiTags('Conversations — messages')
@Controller('messages/policy')
export class MessagesPolicyController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Limits applied to message bodies.' })
  @ApiOkResponse({ type: MessagesPolicyDto })
  policy(): MessagesPolicyBody {
    return { bodyMaxLength: this.config.get('messages.body_max_length') };
  }
}
