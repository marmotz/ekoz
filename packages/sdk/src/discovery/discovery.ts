/**
 * Discovery resolution and protocol-version guard.
 *
 * `createClient({ server })` receives a domain, never a REST URL (ADR 0006). The
 * SDK resolves `GET https://<server>/.well-known/ekoz` once, caches it for the
 * client lifetime, and refuses to proceed if the server advertises no protocol
 * major this SDK supports.
 */

import { ProtocolMismatchError } from "../transport/errors.js";
import { toNetworkError } from "../transport/problem.js";
import { decodeProblem } from "../transport/problem.js";
import { newRequestId } from "../transport/request-context.js";

/** Protocol majors this SDK is compatible with. */
export const SUPPORTED_PROTOCOL_MAJORS = ["0"] as const;

export const WELL_KNOWN_PATH = "/.well-known/ekoz";

/** Shape of the `/.well-known/ekoz` document (see server discovery.service.ts). */
export interface DiscoveryDocument {
  server: string;
  api: string;
  web: string;
  protocol_versions: string[];
  signing_keys?: unknown;
}

export interface DiscoveryOptions {
  /** Server domain, e.g. `ekoz.example.com` (scheme optional). */
  server?: string;
  /**
   * Escape hatch for local `bun link` dev: a function returning the REST base
   * URL directly. When set, discovery is not fetched and the protocol guard is
   * skipped.
   */
  resolveApiUrl?: () => string | Promise<string>;
  /** `fetch` implementation; defaults to the global. */
  fetch?: typeof fetch;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normaliseServer(server: string): string {
  return trimTrailingSlash(server.replace(/^https?:\/\//, ""));
}

export class Discovery {
  readonly #server: string | undefined;
  readonly #resolveApiUrl: (() => string | Promise<string>) | undefined;
  readonly #fetch: typeof fetch;

  #document: DiscoveryDocument | undefined;
  #pending: Promise<DiscoveryDocument> | undefined;
  #overrideApiUrl: string | undefined;

  constructor(options: DiscoveryOptions) {
    if (!options.server && !options.resolveApiUrl) {
      throw new TypeError(
        "discovery requires either `server` or `resolveApiUrl`",
      );
    }
    this.#server = options.server
      ? normaliseServer(options.server)
      : undefined;
    this.#resolveApiUrl = options.resolveApiUrl;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError(
        "global fetch is unavailable; pass options.fetch explicitly",
      );
    }
    this.#fetch = (input, init) => fetchImpl(input, init);
  }

  /** Whether a discovery document has been resolved and cached. */
  get resolved(): boolean {
    return this.#document !== undefined || this.#overrideApiUrl !== undefined;
  }

  /** The raw discovery document. Throws when `resolveApiUrl` is in use. */
  async get(): Promise<DiscoveryDocument> {
    if (this.#resolveApiUrl) {
      throw new Error(
        "discovery document is unavailable when `resolveApiUrl` is set",
      );
    }
    if (this.#document) return this.#document;
    this.#pending ??= this.#resolve();
    try {
      this.#document = await this.#pending;
      return this.#document;
    } finally {
      this.#pending = undefined;
    }
  }

  /** Force a re-fetch of the discovery document. */
  async refresh(): Promise<DiscoveryDocument> {
    this.#document = undefined;
    this.#pending = undefined;
    return this.get();
  }

  /** REST base URL used by {@link HttpClient} (trailing slash trimmed). */
  async apiBaseUrl(): Promise<string> {
    if (this.#resolveApiUrl) {
      this.#overrideApiUrl ??= trimTrailingSlash(await this.#resolveApiUrl());
      return this.#overrideApiUrl;
    }
    const doc = await this.get();
    return trimTrailingSlash(doc.api);
  }

  async #resolve(): Promise<DiscoveryDocument> {
    const url = `https://${this.#server}${WELL_KNOWN_PATH}`;
    const requestId = newRequestId();

    let response: Response;
    try {
      response = await this.#fetch(url, {
        headers: { Accept: "application/json" },
      });
    } catch (cause) {
      throw toNetworkError(cause, requestId);
    }

    if (!response.ok) {
      throw await decodeProblem(response, requestId);
    }

    const doc = (await response.json()) as DiscoveryDocument;
    this.#assertProtocolCompatible(doc);
    return doc;
  }

  #assertProtocolCompatible(doc: DiscoveryDocument): void {
    const advertised = doc.protocol_versions ?? [];
    const intersection = advertised.filter((major) =>
      (SUPPORTED_PROTOCOL_MAJORS as readonly string[]).includes(major),
    );
    if (intersection.length === 0) {
      throw new ProtocolMismatchError({
        supported: SUPPORTED_PROTOCOL_MAJORS,
        advertised,
      });
    }
  }
}
