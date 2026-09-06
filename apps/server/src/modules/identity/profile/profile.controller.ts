import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import { AvatarNotFoundError, AvatarRejectedError } from '../identity.errors.js';
import type { UploadedAvatar } from './avatar.js';
import { type UpdateProfileBody, UpdateProfileSchema } from './profile.dto.js';
import { type MeView, ProfileService, type PublicProfileView } from './profile.service.js';

/**
 * The authenticated account's own profile (technical.md §13, issue #19).
 */
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  me(@CurrentPrincipal() principal: AuthPrincipal): Promise<MeView> {
    return this.profiles.getMe(principal.userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileBody,
  ): Promise<MeView> {
    return this.profiles.updateProfile(principal.userId, body);
  }

  @Put('avatar')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @CurrentPrincipal() principal: AuthPrincipal,
    @UploadedFile() file: UploadedAvatar | undefined,
  ): Promise<{ avatarUrl: string }> {
    if (!file) {
      throw new AvatarRejectedError('No file was uploaded (expected multipart field "file").');
    }

    return this.profiles.setAvatar(principal.userId, file);
  }

  @Delete('avatar')
  @HttpCode(204)
  deleteAvatar(@CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.profiles.deleteAvatar(principal.userId);
  }
}

/**
 * Public profiles, keyed by identifier (technical.md §13). Authentication is
 * still required — these are not anonymous endpoints.
 */
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly profiles: ProfileService) {}

  @Get(':identifier')
  publicProfile(@Param('identifier') identifier: string): Promise<PublicProfileView> {
    return this.profiles.getPublicProfile(identifier);
  }

  @Get(':identifier/avatar')
  async avatar(@Param('identifier') identifier: string, @Res() res: Response): Promise<void> {
    const blob = await this.profiles.resolveAvatarBlob(identifier);
    if (!blob) {
      throw new AvatarNotFoundError();
    }

    // Same content-addressed response contract as server-core `GET /blobs/:id`
    // (technical.md §13): strong ETag on the hash, long immutable cache.
    if (res.req.headers['if-none-match'] === `"${blob.hash}"`) {
      res.status(304).end();

      return;
    }

    res.setHeader('Content-Type', blob.contentType);
    res.setHeader('Content-Length', String(blob.sizeBytes));
    res.setHeader('ETag', `"${blob.hash}"`);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

    (await this.profiles.openAvatarContent(blob)).pipe(res);
  }
}
