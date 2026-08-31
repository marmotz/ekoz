import { Injectable } from '@nestjs/common';
import type { OwnerLookup } from '../../../core/bootstrap/owner-lookup.js';
import { AccountService } from './account.service.js';

/**
 * Real {@link OwnerLookup} for server-core's setup state machine (issue #18).
 * Bound to `OWNER_LOOKUP` by {@link OwnerLookupModule}, it replaces the
 * `NoOwnerLookup` default so `/setup/*` closes for good once the first owner
 * account exists.
 */
@Injectable()
export class IdentityOwnerLookup implements OwnerLookup {
  constructor(private readonly accounts: AccountService) {}

  ownerExists(): Promise<boolean> {
    return this.accounts.ownerExists();
  }
}
