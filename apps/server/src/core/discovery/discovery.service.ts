import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { SigningService } from '../crypto/signing.service.js';

/** Supported protocol major versions (protocol `CHANGELOG.md`, ADR 0006). */
export const PROTOCOL_VERSIONS = ['0'] as const;

export interface DiscoveryKey {
  public_key: string;
  valid_from: string;
  valid_until: string | null;
}

export interface DiscoveryDocument {
  server: string;
  api: string;
  web: string;
  protocol_versions: string[];
  signing_keys: Record<string, DiscoveryKey>;
}

/**
 * Builds the `GET /.well-known/ekoz` payload (technical.md §4) from
 * `ConfigService` and `SigningService`. Public and cacheable — it exposes only
 * the server's public identity.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly config: ConfigService,
    private readonly signing: SigningService,
  ) {}

  async getDocument(): Promise<DiscoveryDocument> {
    const keys = await this.signing.listPublicKeys();
    const signing_keys: Record<string, DiscoveryKey> = {};
    for (const key of keys) {
      signing_keys[key.id] = {
        public_key: key.publicKey,
        valid_from: key.validFrom,
        valid_until: key.validUntil,
      };
    }

    return {
      server: this.config.get('server.domain'),
      api: this.config.get('server.api_url'),
      web: this.config.get('server.web_url'),
      protocol_versions: [...PROTOCOL_VERSIONS],
      signing_keys,
    };
  }
}
