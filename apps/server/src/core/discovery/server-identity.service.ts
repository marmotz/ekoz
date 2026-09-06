import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertValidServerDomain } from './server-domain.js';

/** Fixed primary key of the single `server_identity` row. */
const IDENTITY_ID = 'server';

/**
 * Server identity guard (technical.md §4, ADR 0007).
 *
 * On boot it validates `server.domain` and pins it: the first boot records the
 * canonical domain, and any later boot with a different `server.domain` is
 * refused — changing it would break every stored `name/server` identifier. Once
 * the identity feature lands a `User` table, an empty-users check can soften
 * this to "refused only while users exist".
 */
@Injectable()
export class ServerIdentityService implements OnModuleInit {
  private readonly logger = new Logger(ServerIdentityService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.assertDomainStable();
  }

  /** The pinned canonical domain, or `null` before the first boot recorded it. */
  async recordedDomain(): Promise<string | null> {
    const row = (await this.prisma.orm.public.ServerIdentity.where({
      id: IDENTITY_ID,
    }).first()) as {
      domain: string;
    } | null;

    return row?.domain ?? null;
  }

  private async assertDomainStable(): Promise<void> {
    const domain = this.config.get('server.domain');
    assertValidServerDomain(domain);

    const recorded = await this.recordedDomain();
    if (recorded === null) {
      await this.prisma.orm.public.ServerIdentity.create({ id: IDENTITY_ID, domain });
      this.logger.log(`Server identity pinned to "${domain}"`);

      return;
    }

    if (recorded !== domain) {
      throw new Error(
        `"server.domain" changed from "${recorded}" to "${domain}". This is not supported: ` +
          'it would break every existing "name/server" identifier. Restore the previous domain.',
      );
    }
  }
}
