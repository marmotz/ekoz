import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { SigningService } from '../crypto/signing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SetupService } from './setup.service.js';

/**
 * Boot coordinator (technical.md §5, ADR 0010). Infra-config validation, the
 * schema-marker check and signing-key generation are each enforced by their own
 * service's init hook; this runs on `OnApplicationBootstrap` (after all of
 * them), confirms them, resolves the setup state and prints the setup token when
 * one is needed.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
    private readonly setup: SetupService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.prisma.healthCheck();
    const key = await this.signing.getActiveKey();
    await this.setup.ensureSetupToken();
    const state = await this.setup.resolveState();

    this.logger.log(
      `Bootstrap complete for "${this.config.get('server.domain')}" ` +
        `(signing key ${key.id}, setup state: ${state})`,
    );
  }
}
