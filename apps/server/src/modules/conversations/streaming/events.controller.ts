import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UnauthenticatedError } from '../../../core/http/auth.errors.js';
import { Public } from '../../../core/http/public.decorator.js';
import {
  STREAM_TICKET_CONSUMER,
  type StreamTicketConsumer,
} from '../../../core/http/stream-ticket-consumer.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { PresenceService } from '../presence/presence.service.js';
import {
  EphemeralBroadcaster,
  type PresenceSignal,
  type TypingSignal,
} from './ephemeral-broadcaster.service.js';
import { FeedReaderService } from './feed-reader.service.js';

/** How often the poll loop checks for new feed rows (technical.md §16). */
const POLL_INTERVAL_MS = 1000;
/** How often a keepalive comment is sent to hold the connection open through proxies. */
const KEEPALIVE_INTERVAL_MS = 15_000;
const PAGE_SIZE = 100;

/**
 * `GET /events` — the per-account SSE fan-in stream (technical.md §16, issue
 * #11). Ticket-authenticated (query string), not bearer-authenticated —
 * `@Public()` opts it out of `AuthGuard`.
 *
 * Two delivery paths, both fanning into the same response:
 * - Durable: `AccountFeedEvent` rows, delivered by polling (a `setInterval`
 *   re-reading the table for this user) rather than a live push — the same
 *   "in-process now" simplification the presence store documents (technical.md
 *   §15) — and consistent with the protocol's "best-effort-live, `/sync` is
 *   the source of truth" contract. `Last-Event-ID` is honoured, falling back
 *   to `?lastEventId=`; with neither, the stream starts at the current head
 *   of the account's feed (live frames only, no replay).
 * - Ephemeral: presence and typing signals (technical.md §15, issue #10),
 *   pushed live through `EphemeralBroadcaster` — never persisted, so there is
 *   no replay if a connection misses one.
 *
 * The presence/typing subscription set (co-members + `dm` partners, member
 * rooms) is computed once at connect time; a membership change made after
 * connecting only takes effect on the next reconnect — a known first-increment
 * limitation.
 */
@ApiTags('Conversations — stream')
@Controller()
export class EventsController {
  constructor(
    @Inject(STREAM_TICKET_CONSUMER) private readonly tickets: StreamTicketConsumer,
    private readonly feed: FeedReaderService,
    private readonly presence: PresenceService,
    private readonly broadcaster: EphemeralBroadcaster,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('events')
  @ApiOperation({ summary: 'SSE account feed stream, authenticated by a single-use ticket.' })
  @ApiProduces('text/event-stream')
  @ApiQuery({ name: 'ticket', required: true, type: String })
  async stream(
    @Query('ticket') ticket: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // `lastEventId` (query) and `Last-Event-ID` (header) are read from the
    // raw request, not `@Query(...)` / `@Headers(...)` param decorators.
    // Nest's Swagger auto-detection of those reflects TS parameter types via
    // `emitDecoratorMetadata`, which esbuild (vitest's transform) does not
    // support at all, and stacking a second explicit `@ApiQuery`/`@ApiHeader`
    // call hits a separate bun-vs-vitest decorator-evaluation-order mismatch.
    // Together they make `openapi:emit`'s committed-output determinism
    // (`emit.e2e-spec.ts`) impossible to satisfy under both runtimes with
    // more than one documented query/header parameter on this method — so
    // only `ticket` (the one that matters for auth) is documented; the
    // reconnection cursor is functional but undocumented in the OpenAPI
    // description.
    const lastEventIdHeader = req.headers['last-event-id'];
    const lastEventIdQuery =
      typeof req.query.lastEventId === 'string' ? req.query.lastEventId : undefined;
    if (!ticket) {
      throw new UnauthenticatedError('A stream ticket is required.');
    }
    const binding = await this.tickets.consume(ticket);
    if (!binding) {
      throw new UnauthenticatedError('This stream ticket is unknown, already used, or expired.');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Required behind a buffering reverse proxy (nginx) — see http/README.md.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const lastEventId =
      (Array.isArray(lastEventIdHeader) ? lastEventIdHeader[0] : lastEventIdHeader) ??
      lastEventIdQuery;
    // No cursor: start at the current head, live frames only (synchronisation.md).
    let cursor = parseCursor(lastEventId) ?? (await this.feed.head(binding.userId));

    const push = async (): Promise<void> => {
      const rows = await this.feed.since(binding.userId, cursor, PAGE_SIZE);
      for (const row of rows) {
        cursor = row.feedSeq;
        res.write(`id: ${row.feedSeq}\n`);
        res.write(`event: ${row.kind}\n`);
        // `roomId` is a column on the feed row, not part of `payload` itself
        // (the `room_event` payload mirrors the event's own content only) —
        // fold it in here so a `room_event` delivered on this multiplexed
        // stream is still attributable to its room.
        res.write(
          `data: ${JSON.stringify({ roomId: row.roomId, ...(row.payload as object) })}\n\n`,
        );
      }
    };

    await push();

    const pollTimer = setInterval(() => {
      push().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    const keepaliveTimer = setInterval(() => {
      res.write(': keepalive\n\n');
    }, KEEPALIVE_INTERVAL_MS);

    const onPresence = (signal: PresenceSignal): void => {
      res.write(`event: presence\ndata: ${JSON.stringify(signal)}\n\n`);
    };
    const peers = await this.presence.visiblePeersOf(binding.userId);
    for (const peerId of peers) {
      this.broadcaster.onPresence(peerId, onPresence);
    }

    const onTyping = (signal: TypingSignal): void => {
      res.write(`event: typing\ndata: ${JSON.stringify(signal)}\n\n`);
    };
    const memberships = (await this.prisma.orm.public.Membership.where({
      userId: binding.userId,
    }).all()) as Array<{ roomId: string }>;
    const roomIds = memberships.map((m) => m.roomId);
    for (const roomId of roomIds) {
      this.broadcaster.onTyping(roomId, onTyping);
    }

    res.req.on('close', () => {
      clearInterval(pollTimer);
      clearInterval(keepaliveTimer);
      for (const peerId of peers) {
        this.broadcaster.offPresence(peerId, onPresence);
      }
      for (const roomId of roomIds) {
        this.broadcaster.offTyping(roomId, onTyping);
      }
      res.end();
    });
  }
}

function parseCursor(raw: string | undefined): bigint | null {
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  return BigInt(raw);
}
