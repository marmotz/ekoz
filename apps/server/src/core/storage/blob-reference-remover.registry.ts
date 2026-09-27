import { Injectable, Logger } from '@nestjs/common';

/**
 * A feature's cleanup for one blob when an admin force-removes content
 * everywhere it is referenced (technical.md §S11, issue #146): find every row
 * referencing `blobId`, delete it (emitting whatever live event the feature
 * normally emits for that removal), and release the blob reference. Each
 * remover manages its own transaction(s) — the registry only sequences them.
 */
export type BlobReferenceRemover = (blobId: string) => Promise<void>;

/**
 * Holds the {@link BlobReferenceRemover} each feature contributes (technical.md
 * §S11): conversations registers one for message attachments and one for link
 * preview images, identity registers one for avatars. Core has no feature
 * imports; a feature never imports another feature (`eslint-plugin-boundaries`)
 * — this registry is the seam `DELETE /admin/blobs/:id` uses instead.
 */
@Injectable()
export class BlobReferenceRemoverRegistry {
  private readonly logger = new Logger(BlobReferenceRemoverRegistry.name);
  private readonly removers: BlobReferenceRemover[] = [];

  register(remover: BlobReferenceRemover): void {
    this.removers.push(remover);
  }

  /** Runs every registered remover for `blobId`, in registration order. */
  async removeEverywhere(blobId: string): Promise<void> {
    for (const remover of this.removers) {
      await remover(blobId);
    }
    this.logger.log(
      `Removed every reference to blob ${blobId} (${this.removers.length} remover(s))`,
    );
  }
}
