import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../http/public.decorator.js';
import { type DiscoveryDocument, DiscoveryService } from './discovery.service.js';

/**
 * `GET /.well-known/ekoz` — unauthenticated, cacheable server discovery
 * document (technical.md §4, ADR 0006). Consumed by clients and by peer servers
 * to learn the API base URL, supported protocol versions and public signing
 * keys.
 */
@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('.well-known/ekoz')
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  getDiscoveryDocument(): Promise<DiscoveryDocument> {
    return this.discovery.getDocument();
  }
}
