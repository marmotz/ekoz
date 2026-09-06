import { Module } from '@nestjs/common';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';
import { ServerIdentityService } from './server-identity.service.js';

/**
 * Server identity and discovery (technical.md §4, ADR 0006 / 0007): the
 * boot-time `server.domain` guard and the public `GET /.well-known/ekoz`
 * document.
 */
@Module({
  controllers: [DiscoveryController],
  providers: [DiscoveryService, ServerIdentityService],
  exports: [ServerIdentityService],
})
export class DiscoveryModule {}
