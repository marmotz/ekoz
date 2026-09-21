import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
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
import { type RoomPreview, RoomPreviewDto, type RoomView, RoomViewDto } from './room.view.js';
import {
  type CreateChannel,
  CreateChannelDto,
  type CreateSpace,
  CreateSpaceDto,
  type MoveRoom,
  MoveRoomDto,
  RoomIdParamSchema,
  type UpdateRoom,
  UpdateRoomDto,
} from './rooms.dto.js';
import { RoomsService } from './rooms.service.js';

@ApiTags('Conversations — rooms')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post('spaces')
  @ApiOperation({ summary: 'Create a space (hierarchy node).' })
  @ApiCreatedResponse({ type: RoomViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 422] })
  createSpace(
    @Body(new ZodValidationPipe(CreateSpaceDto)) body: CreateSpace,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.rooms.createSpace(principal, body);
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Create a channel, attached to a space.' })
  @ApiCreatedResponse({ type: RoomViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 422] })
  createChannel(
    @Body(new ZodValidationPipe(CreateChannelDto)) body: CreateChannel,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.rooms.createChannel(principal, body);
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: 'Room detail.' })
  @ApiOkResponse({ type: RoomViewDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  getRoom(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.rooms.getRoom(principal, params.id);
  }

  @Get('rooms/:id/preview')
  @ApiOperation({ summary: 'Preview an invite-only room, to request to join it.' })
  @ApiOkResponse({ type: RoomPreviewDto })
  @ApiProblemResponses({ statuses: [404] })
  getPreview(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomPreview> {
    return this.rooms.getPreview(principal, params.id);
  }

  @Get('rooms/:id/children')
  @ApiOperation({ summary: 'Direct children of a room.' })
  @ApiOkResponse({ type: RoomViewDto, isArray: true })
  @ApiProblemResponses({ statuses: [403, 404] })
  getChildren(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView[]> {
    return this.rooms.getChildren(principal, params.id);
  }

  @Patch('rooms/:id')
  @ApiOperation({ summary: 'Update room name / topic / visibility / read-only.' })
  @ApiOkResponse({ type: RoomViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  updateRoom(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(UpdateRoomDto)) body: UpdateRoom,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.rooms.updateRoom(principal, params.id, body);
  }

  @Post('rooms/:id/move')
  @HttpCode(200)
  @ApiOperation({ summary: 'Move a room under a new parent (or detach a space to root).' })
  @ApiOkResponse({ type: RoomViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 422] })
  moveRoom(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(MoveRoomDto)) body: MoveRoom,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.rooms.moveRoom(principal, params.id, body);
  }

  @Delete('rooms/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a room (blocked while it still has children).' })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  async deleteRoom(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.rooms.deleteRoom(principal, params.id);
  }
}
