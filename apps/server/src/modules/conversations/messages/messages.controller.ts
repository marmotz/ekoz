import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import { type MessageView, MessageViewDto } from './message.view.js';
import {
  type EditMessage,
  EditMessageDto,
  type FilesPage,
  FilesPageDto,
  type ListFilesQuery,
  ListFilesQueryDto,
  type ListMessagesQuery,
  ListMessagesQueryDto,
  MessageAttachmentIdParamSchema,
  MessageIdParamSchema,
  type MessagePage,
  MessagePageDto,
  type SendMessage,
  SendMessageDto,
} from './messages.dto.js';
import { MessagesService } from './messages.service.js';
import { type MessagePinView, MessagePinViewDto } from './pin.view.js';

@ApiTags('Conversations — messages')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly moderation: ModerationService,
  ) {}

  @Post('rooms/:id/messages')
  @ApiOperation({ summary: 'Send a message (needs room.post).' })
  @ApiCreatedResponse({ type: MessageViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 422] })
  sendMessage(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(SendMessageDto)) body: SendMessage,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MessageView> {
    return this.messages.sendMessage(principal, params.id, body);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({
    summary: 'List messages, newest page first, ascending inside the page (needs room.read).',
  })
  @ApiOkResponse({ type: MessagePageDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  listMessages(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Query(new ZodValidationPipe(ListMessagesQueryDto)) query: ListMessagesQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MessagePage> {
    return this.messages.listMessages(principal, params.id, query);
  }

  @Get('rooms/:id/messages/:messageId')
  @ApiOperation({ summary: 'Message detail.' })
  @ApiOkResponse({ type: MessageViewDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  getMessage(
    @Param(new ZodValidationPipe(MessageIdParamSchema)) params: { id: string; messageId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MessageView> {
    return this.messages.getMessage(principal, params.id, params.messageId);
  }

  @Patch('rooms/:id/messages/:messageId')
  @ApiOperation({ summary: 'Edit a message body (needs room.edit_own or room.edit_any).' })
  @ApiOkResponse({ type: MessageViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 422] })
  editMessage(
    @Param(new ZodValidationPipe(MessageIdParamSchema)) params: { id: string; messageId: string },
    @Body(new ZodValidationPipe(EditMessageDto)) body: EditMessage,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MessageView> {
    return this.messages.editMessage(principal, params.id, params.messageId, body);
  }

  @Delete('rooms/:id/messages/:messageId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a message, leaving a tombstone (needs room.delete_own or room.delete_any).',
  })
  @ApiProblemResponses({ statuses: [403, 404] })
  async deleteMessage(
    @Param(new ZodValidationPipe(MessageIdParamSchema)) params: { id: string; messageId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.moderation.deleteMessage(principal, params.id, params.messageId);
  }

  @Delete('rooms/:id/messages/:messageId/attachments/:attachmentId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove a message attachment (needs room.delete_own or room.delete_any).',
  })
  @ApiProblemResponses({ statuses: [403, 404] })
  async removeAttachment(
    @Param(new ZodValidationPipe(MessageAttachmentIdParamSchema))
    params: { id: string; messageId: string; attachmentId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.moderation.removeAttachment(
      principal,
      params.id,
      params.messageId,
      params.attachmentId,
    );
  }

  @Get('rooms/:id/files')
  @ApiOperation({ summary: "List the room's attachments, newest first (needs room.read)." })
  @ApiOkResponse({ type: FilesPageDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  listFiles(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Query(new ZodValidationPipe(ListFilesQueryDto)) query: ListFilesQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<FilesPage> {
    return this.messages.listFiles(principal, params.id, query);
  }

  @Put('rooms/:id/pins/:messageId')
  @ApiOperation({ summary: 'Pin a message (needs room.pin).' })
  @ApiOkResponse({ type: MessagePinViewDto })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  pin(
    @Param(new ZodValidationPipe(MessageIdParamSchema)) params: { id: string; messageId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MessagePinView> {
    return this.messages.pin(principal, params.id, params.messageId);
  }

  @Delete('rooms/:id/pins/:messageId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unpin a message (needs room.pin).' })
  @ApiProblemResponses({ statuses: [403, 404] })
  async unpin(
    @Param(new ZodValidationPipe(MessageIdParamSchema)) params: { id: string; messageId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.messages.unpin(principal, params.id, params.messageId);
  }

  @Get('rooms/:id/pins')
  @ApiOperation({ summary: 'List pinned messages, most recent first.' })
  @ApiOkResponse({ type: MessagePinViewDto, isArray: true })
  @ApiProblemResponses({ statuses: [403, 404] })
  listPins(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MessagePinView[]> {
    return this.messages.listPins(principal, params.id);
  }
}
