/**
 * Minimal compact-JWS helpers for the access token (technical.md §7, ADR 0008).
 *
 * The server already owns an Ed25519 keypair (`SigningService`); a full JWT
 * library would only duplicate that. These helpers build and split the
 * `header.payload.signature` triple — signing and verification of the bytes is
 * delegated to `SigningService` by {@link TokenService}.
 */

export interface JwtHeader {
  alg: 'EdDSA';
  typ: 'JWT';
  kid: string;
}

export interface AccessTokenClaims {
  /** `server.domain`. */
  iss: string;
  /** `userId`. */
  sub: string;
  /** `sessionId`. */
  sid: string;
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Expiry, epoch seconds. */
  exp: number;
}

export function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(JSON.stringify(value));
}

/** The bytes that get signed: `base64url(header).base64url(payload)`. */
export function signingInput(header: JwtHeader, claims: AccessTokenClaims): string {
  return `${encodeJson(header)}.${encodeJson(claims)}`;
}

export function assembleToken(input: string, signature: Buffer): string {
  return `${input}.${base64UrlEncode(signature)}`;
}

export interface ParsedToken {
  header: JwtHeader;
  claims: AccessTokenClaims;
  /** The `header.payload` slice, as signed. */
  signingInput: string;
  signature: Buffer;
}

/** Split and JSON-parse a compact token. Returns `null` on any structural fault. */
export function parseToken(token: string): ParsedToken | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  try {
    const header = JSON.parse(base64UrlDecode(headerPart).toString('utf8')) as JwtHeader;
    const claims = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as AccessTokenClaims;
    if (header.alg !== 'EdDSA' || typeof header.kid !== 'string') {
      return null;
    }

    if (
      typeof claims.sub !== 'string' ||
      typeof claims.sid !== 'string' ||
      typeof claims.exp !== 'number'
    ) {
      return null;
    }

    return {
      header,
      claims,
      signingInput: `${headerPart}.${payloadPart}`,
      signature: base64UrlDecode(signaturePart),
    };
  } catch {
    return null;
  }
}
