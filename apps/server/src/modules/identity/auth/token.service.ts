import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { SigningService } from '../../../core/crypto/signing.service.js';
import { UnauthenticatedError } from '../identity.errors.js';
import {
  type AccessTokenClaims,
  assembleToken,
  type JwtHeader,
  parseToken,
  signingInput,
} from './jwt.js';

export interface IssuedAccessToken {
  token: string;
  /** Seconds until expiry. */
  expiresIn: number;
}

/**
 * Access token (technical.md §7): a short-lived JWT signed `EdDSA` with the
 * active server key. Stateless to verify — signature + `exp` + `iss` — with
 * revocation handled out of band by the `sid` denylist ({@link
 * RevokedSessionRegistry}).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly signing: SigningService,
    private readonly config: ConfigService,
  ) {}

  async issueAccessToken(params: {
    userId: string;
    sessionId: string;
  }): Promise<IssuedAccessToken> {
    const ttl = this.config.get('auth.access_token_ttl');
    const now = Math.floor(Date.now() / 1000);
    const active = await this.signing.getActiveKey();

    const header: JwtHeader = { alg: 'EdDSA', typ: 'JWT', kid: active.id };
    const claims: AccessTokenClaims = {
      iss: this.config.get('server.domain'),
      sub: params.userId,
      sid: params.sessionId,
      iat: now,
      exp: now + ttl,
    };

    const input = signingInput(header, claims);
    const { signature } = await this.signing.sign(Buffer.from(input, 'utf8'));

    return { token: assembleToken(input, signature), expiresIn: ttl };
  }

  /**
   * Verify signature, `iss` and `exp`. Throws {@link UnauthenticatedError} on
   * any failure; returns the claims otherwise. Session revocation and account
   * status are the guard's job, not this method's.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const parsed = parseToken(token);
    if (!parsed) {
      throw new UnauthenticatedError('Malformed access token.');
    }

    if (parsed.claims.iss !== this.config.get('server.domain')) {
      throw new UnauthenticatedError('Access token issuer mismatch.');
    }

    if (parsed.claims.exp * 1000 <= Date.now()) {
      throw new UnauthenticatedError('The access token has expired.');
    }

    const ok = await this.signing.verify(
      parsed.header.kid,
      Buffer.from(parsed.signingInput, 'utf8'),
      parsed.signature,
    );
    if (!ok) {
      throw new UnauthenticatedError('Invalid access token signature.');
    }

    return parsed.claims;
  }
}
