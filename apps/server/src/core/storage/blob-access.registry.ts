import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../http/request-context.js';
import type { Blob } from './blob.service.js';

/**
 * A referencing feature's answer to "may this caller download this blob?".
 * Identity registers one for avatars, content-and-sharing one for attachments
 * (technical.md §6). Access is granted if **any** registered policy returns
 * `true`.
 */
export type BlobAccessPolicy = (blob: Blob, context: RequestContext | undefined) => boolean | Promise<boolean>;

/**
 * Holds the access policies the referencing features contribute. Server-core
 * ships the download endpoint and the hook; it grants nothing on its own, so a
 * blob with no matching policy is not downloadable.
 */
@Injectable()
export class BlobAccessRegistry {
  private readonly policies: BlobAccessPolicy[] = [];

  register(policy: BlobAccessPolicy): void {
    this.policies.push(policy);
  }

  async isAllowed(blob: Blob, context: RequestContext | undefined): Promise<boolean> {
    for (const policy of this.policies) {
      if (await policy(blob, context)) {
        return true;
      }
    }

    return false;
  }
}
