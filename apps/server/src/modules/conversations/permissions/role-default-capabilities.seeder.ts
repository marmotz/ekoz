import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { ROLE_DEFAULT_CAPABILITIES } from './role-default-capabilities.js';

/**
 * Seeds `role_default_capability` from the technical.md §6 matrix on boot
 * (issue #3, item 3). Prisma 8 has no first-class seed step, so this follows
 * the documented workaround: a script (here, a boot-time upsert) that runs
 * through the app's own `db` instance. Idempotent — safe to run every boot.
 */
@Injectable()
export class RoleDefaultCapabilitiesSeeder implements OnModuleInit {
  private readonly logger = new Logger(RoleDefaultCapabilitiesSeeder.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const { role, capability } of ROLE_DEFAULT_CAPABILITIES) {
      await this.prisma.orm.public.RoleDefaultCapability.where({ role, capability }).upsert({
        create: { role, capability, effect: 'allow' },
        update: { effect: 'allow' },
      });
    }
    this.logger.log(`Seeded ${ROLE_DEFAULT_CAPABILITIES.length} default role capability grant(s)`);
  }
}
