import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const FetchLinkPreviewSchema = z.object({ url: z.url() });
export type FetchLinkPreview = z.infer<typeof FetchLinkPreviewSchema>;
export class FetchLinkPreviewDto extends createZodDto(FetchLinkPreviewSchema) {}
