import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '../config/config.service.js';
import { ApiProblemResponses } from '../http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../http/auth.guard.js';
import { CurrentPrincipal } from '../http/current-principal.decorator.js';
import { Public } from '../http/public.decorator.js';
import { fileUrl } from '../http/user-links.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { FileAccessRegistry } from './file-access.registry.js';
import { normalizeFileRef } from './file-ref.js';
import { FileUrlSigner } from './file-url-token.js';
import {
  type IssueFileUrlsBody,
  IssueFileUrlsDto,
  type IssueFileUrlsResponse,
  IssueFileUrlsResponseDto,
} from './files.dto.js';
import { contentDispositionFor, parseRange } from './files-http.js';
import { FileNotFoundError } from './storage.errors.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage-driver.js';

const S3_PRESIGN_TTL_SECONDS = 60;

/**
 * Short-lived signed file URLs (technical.md §S6): `POST /files/urls` issues
 * tokens after the access check; `GET /files/:token` re-checks access on
 * every request for the token's user, not only when it was issued.
 */
@Controller()
export class FilesController {
  constructor(
    private readonly access: FileAccessRegistry,
    private readonly config: ConfigService,
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver,
  ) {}

  private get signer(): FileUrlSigner {
    return new FileUrlSigner(this.config.get('secret.key'));
  }

  @Post('files/urls')
  @UseGuards(AuthGuard)
  @ApiTags('Files')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Issue short-lived signed download URLs for up to 100 file refs.' })
  @ApiOkResponse({ type: IssueFileUrlsResponseDto })
  @ApiProblemResponses({ validation: true })
  async issueUrls(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(IssueFileUrlsDto)) body: IssueFileUrlsBody,
  ): Promise<IssueFileUrlsResponse> {
    const ttlSeconds = this.config.get('files.url_ttl');
    const apiUrl = this.config.get('server.api_url');
    const signer = this.signer;

    const items = await Promise.all(
      body.items.map(async (ref): Promise<IssueFileUrlsResponse['items'][number]> => {
        const internal = normalizeFileRef(ref);
        const resolved = await this.access.resolve(internal, principal.userId);
        if (!resolved) {
          return { ref, error: 'files.not_found' };
        }

        const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
        const token = signer.sign({ ...internal, userId: principal.userId, exp });

        return { ref, url: fileUrl(apiUrl, token), expiresAt: new Date(exp * 1000).toISOString() };
      }),
    );

    return { items };
  }

  @Get('files/:token')
  @Public()
  @ApiExcludeEndpoint()
  async download(
    @Param('token') token: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const claims = this.signer.verify(token);
    if (!claims) {
      throw new FileNotFoundError();
    }

    const resolved = await this.access.resolve(claims, claims.userId);
    if (!resolved) {
      throw new FileNotFoundError();
    }

    const { blob, filename, contentType } = resolved;
    const effectiveType = contentType ?? blob.contentType;
    const size = Number(blob.sizeBytes);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Content-Disposition', contentDispositionFor(effectiveType, filename));

    if (this.config.get('storage.driver') === 's3' && this.driver.presignGet) {
      const url = await this.driver.presignGet(blob.storageKey, S3_PRESIGN_TTL_SECONDS, {
        contentDisposition: contentDispositionFor(effectiveType, filename),
        contentType: effectiveType,
      });
      res.redirect(302, url as string);

      return;
    }

    res.setHeader('ETag', `"${blob.hash}"`);
    const remainingTtl = Math.max(0, claims.exp - Math.floor(Date.now() / 1000));
    res.setHeader('Cache-Control', `private, max-age=${remainingTtl}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', effectiveType);

    if (range && this.driver.getRange) {
      const parsed = parseRange(range, size);
      if (!parsed) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();

        return;
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${size}`);
      res.setHeader('Content-Length', String(parsed.end - parsed.start + 1));
      const stream = await this.driver.getRange(blob.storageKey, parsed.start, parsed.end);
      stream.pipe(res);

      return;
    }

    res.setHeader('Content-Length', String(size));
    const stream = await this.driver.get(blob.storageKey);
    stream.pipe(res);
  }
}
