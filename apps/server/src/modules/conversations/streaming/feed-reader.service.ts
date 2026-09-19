import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';

export interface AccountFeedEventRow {
  userId: string;
  feedSeq: bigint;
  roomId: string;
  roomSeq: bigint | null;
  kind: string;
  payload: unknown;
  createdAt: string;
}

/** Reads a user's account feed — the `GET /events` poll loop (technical.md §16, issue #11). */
@Injectable()
export class FeedReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async since(userId: string, cursor: bigint, limit: number): Promise<AccountFeedEventRow[]> {
    return (await this.prisma.orm.public.AccountFeedEvent.where((f) =>
      and(f.userId.eq(userId), f.feedSeq.gt(cursor)),
    )
      .orderBy((f) => f.feedSeq.asc())
      .limit(limit)
      .all()) as AccountFeedEventRow[];
  }
}
