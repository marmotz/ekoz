import {
  Controller,
  Delete,
  Get,
  Head,
  Headers,
  HttpCode,
  Options,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '../config/config.service.js';
import { AuthGuard, type AuthPrincipal } from '../http/auth.guard.js';
import { CurrentPrincipal } from '../http/current-principal.decorator.js';
import { Public } from '../http/public.decorator.js';
import {
  UploadNotFoundError,
  UploadOffsetMismatchError,
  UploadRequestInvalidError,
} from './storage.errors.js';
import {
  parseUploadMetadata,
  sanitizeFilename,
  TUS_EXTENSIONS,
  TUS_VERSION,
} from './tus-headers.js';
import { type FinalizationResult, type UploadRecord, UploadService } from './upload.service.js';

/** JSON view of an upload for `GET /uploads/:id` (crash recovery, not part of tus). */
function toView(upload: UploadRecord) {
  return {
    id: upload.id,
    state: upload.state,
    offset: upload.offset.toString(),
    length: upload.length.toString(),
    filename: upload.filename,
    expiresAt: upload.expiresAt,
  };
}

/**
 * Resumable uploads under `/uploads` (technical.md §S4): an in-house tus 1.0
 * implementation (core + creation, termination, expiration), Bearer-authenticated.
 * Excluded from the generated OpenAPI document — `tus` headers are not
 * described by OpenAPI; the protocol is documented by hand
 * (`docs/protocol/files-and-sharing.md`) and the SDK binds these routes directly.
 */
@ApiExcludeController()
@Controller('uploads')
export class UploadController {
  constructor(
    private readonly uploads: UploadService,
    private readonly config: ConfigService,
  ) {}

  @Options()
  @Public()
  @HttpCode(204)
  options(@Res({ passthrough: true }) res: Response): void {
    res.setHeader('Tus-Resumable', TUS_VERSION);
    res.setHeader('Tus-Version', TUS_VERSION);
    res.setHeader('Tus-Extension', TUS_EXTENSIONS);
    res.setHeader('Tus-Max-Size', String(this.config.get('uploads.max_file_bytes')));
  }

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Headers('upload-length') uploadLength: string | undefined,
    @Headers('upload-metadata') uploadMetadata: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (!uploadLength || !/^\d+$/.test(uploadLength)) {
      throw new UploadRequestInvalidError(
        'Upload-Length is required and must be a non-negative integer.',
      );
    }

    const metadata = parseUploadMetadata(uploadMetadata);
    if (!metadata.filename) {
      throw new UploadRequestInvalidError('Upload-Metadata must declare a filename.');
    }
    let filename: string;
    try {
      filename = sanitizeFilename(metadata.filename);
    } catch {
      throw new UploadRequestInvalidError('The declared filename is invalid.');
    }

    const upload = await this.uploads.create(principal.userId, BigInt(uploadLength), filename);

    res.setHeader('Tus-Resumable', TUS_VERSION);
    res.setHeader('Location', `/uploads/${upload.id}`);
    res.setHeader('Upload-Expires', new Date(upload.expiresAt).toUTCString());
  }

  @Head(':id')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async head(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const upload = await this.findAccessible(id, principal.userId);

    res.setHeader('Tus-Resumable', TUS_VERSION);
    res.setHeader('Upload-Offset', upload.offset.toString());
    res.setHeader('Upload-Length', upload.length.toString());
    res.setHeader('Cache-Control', 'no-store');
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  async patch(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id') id: string,
    @Headers('upload-offset') uploadOffset: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FinalizationResult | undefined> {
    const upload = await this.findAccessible(id, principal.userId);

    if (!uploadOffset || !/^\d+$/.test(uploadOffset)) {
      throw new UploadOffsetMismatchError(
        'Upload-Offset is required and must be a non-negative integer.',
      );
    }

    const { offset, result } = await this.uploads.appendChunk(upload, BigInt(uploadOffset), req);

    res.setHeader('Tus-Resumable', TUS_VERSION);
    res.setHeader('Upload-Offset', offset.toString());

    if (!result) {
      res.status(204);

      return undefined;
    }

    res.status(200);
    res.setHeader('Ekoz-Upload', JSON.stringify(result));

    return result;
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async cancel(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<void> {
    const upload = await this.findAccessible(id, principal.userId);
    await this.uploads.cancel(upload);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<ReturnType<typeof toView>> {
    const upload = await this.findAccessible(id, principal.userId);

    return toView(upload);
  }

  private async findAccessible(id: string, userId: string): Promise<UploadRecord> {
    const upload = await this.uploads.findOwned(id, userId);
    if (!upload) {
      throw new UploadNotFoundError();
    }
    this.uploads.assertNotExpired(upload);

    return upload;
  }
}
