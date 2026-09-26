import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { MessageNotFoundError } from '../conversations.errors.js';

/**
 * Per-member history floor (`Membership.historyFromSeq`): a member reads only
 * the messages with `seq >= floor`. Only explicit memberships carry a floor;
 * access inherited from a space has none.
 */
@Injectable()
export class HistoryFloorService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's floor in the room, or `null` for the full history. */
  async floorFor(roomId: string, userId: string): Promise<bigint | null> {
    const row = (await this.prisma.orm.public.Membership.where({ roomId, userId }).first()) as {
      historyFromSeq: bigint | null;
    } | null;

    return row?.historyFromSeq ?? null;
  }

  /** A message below the user's floor is unknown to them: `404 message.not_found`. */
  async assertVisible(roomId: string, userId: string, seq: bigint): Promise<void> {
    const floor = await this.floorFor(roomId, userId);
    if (floor !== null && seq < floor) {
      throw new MessageNotFoundError();
    }
  }
}
