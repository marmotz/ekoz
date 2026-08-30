import { Global, Module } from '@nestjs/common';
import { SigningService } from './signing.service.js';

/**
 * Cross-cutting cryptography (technical.md §4, ADR 0006): the server
 * `SigningService` (which builds its `SecretBox` from `secret.key` once
 * configuration is loaded). Global so any feature can inject it without
 * re-importing this module.
 *
 * `SecretBox` and the hashing helpers are plain modules — import them directly
 * where needed; they take no Nest wiring.
 */
@Global()
@Module({
  providers: [SigningService],
  exports: [SigningService],
})
export class CryptoModule {}
