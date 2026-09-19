import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import { type ReadMarkerView, ReadMarkerViewDto } from './receipt.view.js';
import { type SetReceipt, SetReceiptDto } from './receipts.dto.js';
import { ReceiptsService } from './receipts.service.js';

@ApiTags('Conversations — receipts')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Put('rooms/:id/receipt')
  @ApiOperation({ summary: 'Set your read marker (monotonic: a lower seq is ignored).' })
  @ApiOkResponse({ type: ReadMarkerViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  setReceipt(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(SetReceiptDto)) body: SetReceipt,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ReadMarkerView> {
    return this.receipts.setReceipt(principal, params.id, BigInt(body.seq));
  }

  @Get('rooms/:id/receipts')
  @ApiOperation({ summary: "Every participant's read marker (participants only)." })
  @ApiOkResponse({ type: ReadMarkerViewDto, isArray: true })
  @ApiProblemResponses({ statuses: [403, 404] })
  listReceipts(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ReadMarkerView[]> {
    return this.receipts.listReceipts(principal, params.id);
  }
}
