import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DiscoveryKeySchema = z.object({
  public_key: z.string(),
  valid_from: z.iso.datetime(),
  valid_until: z.iso.datetime().nullable(),
});

/** `GET /.well-known/ekoz` response (technical.md §4, ADR 0006). */
export const DiscoveryDocumentSchema = z.object({
  server: z.string(),
  api: z.url(),
  web: z.url(),
  protocol_versions: z.array(z.string()),
  signing_keys: z.record(z.string(), DiscoveryKeySchema),
});
export class DiscoveryDocumentDto extends createZodDto(DiscoveryDocumentSchema) {}
