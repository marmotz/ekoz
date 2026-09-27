import { z } from 'zod';

/**
 * A reference to downloadable content (technical.md §S6). The API accepts the
 * friendly discriminated shape below; internally it is normalised to
 * {@link InternalFileRef} so the signer and the access registry don't need to
 * know each kind's field name.
 */
export const FileRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('attachment'),
    id: z.string().min(1),
    variant: z.enum(['original', 'thumbnail']),
  }),
  z.object({ kind: z.literal('message_preview'), messageId: z.string().min(1) }),
  z.object({ kind: z.literal('preview'), previewId: z.string().min(1) }),
]);
export type FileRef = z.infer<typeof FileRefSchema>;

export type FileRefKind = FileRef['kind'];

/** {@link FileRef}, flattened to one `id` field and an optional `variant`. */
export interface InternalFileRef {
  kind: FileRefKind;
  id: string;
  variant: string;
}

export function normalizeFileRef(ref: FileRef): InternalFileRef {
  switch (ref.kind) {
    case 'attachment':
      return { kind: ref.kind, id: ref.id, variant: ref.variant };
    case 'message_preview':
      return { kind: ref.kind, id: ref.messageId, variant: '' };
    case 'preview':
      return { kind: ref.kind, id: ref.previewId, variant: '' };
  }
}
