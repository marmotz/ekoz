import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../http/public.decorator.js';
import { DiscoveryDocumentDto } from './discovery.dto.js';
import { type DiscoveryDocument, DiscoveryService } from './discovery.service.js';

/**
 * `GET /.well-known/ekoz` — unauthenticated, cacheable server discovery
 * document (technical.md §4, ADR 0006). Consumed by clients and by peer servers
 * to learn the API base URL, supported protocol versions and public signing
 * keys.
 */
@ApiTags('Discovery')
@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('.well-known/ekoz')
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Public server discovery document.' })
  @ApiOkResponse({ type: DiscoveryDocumentDto })
  getDiscoveryDocument(): Promise<DiscoveryDocument> {
    return this.discovery.getDocument();
  }
}
