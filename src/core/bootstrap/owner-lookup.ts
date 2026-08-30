/**
 * Seam for "does an owner account exist?" (technical.md §5). The `User` table is
 * owned by identity-and-profiles, so server-core cannot answer this directly:
 * the identity module overrides {@link OWNER_LOOKUP} with a real query. Until
 * then {@link NoOwnerLookup} answers "no owner", keeping setup open.
 */
export interface OwnerLookup {
  ownerExists(): Promise<boolean>;
}

/** DI token for the active {@link OwnerLookup}. */
export const OWNER_LOOKUP = Symbol('OWNER_LOOKUP');

/** Default used until identity-and-profiles provides a real lookup. */
export class NoOwnerLookup implements OwnerLookup {
  async ownerExists(): Promise<boolean> {
    return false;
  }
}
