import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { UserSummaryReader } from '../../../core/users/user-summary.reader.js';
import { AvatarNotFoundError, AvatarRejectedError } from '../identity.errors.js';
import type { UploadedAvatar } from './avatar.js';
import {
  AvatarUploadedDto,
  MeViewDto,
  PublicProfileViewDto,
  type UpdateProfileBody,
  UpdateProfileDto,
  type UserSummariesQuery,
  UserSummariesQuerySchema,
  type UserSummaryListView,
  UserSummaryListViewDto,
} from './profile.dto.js';
import { type MeView, ProfileService, type PublicProfileView } from './profile.service.js';

/**
 * The authenticated account's own profile (technical.md §13, issue #19).
 */
@ApiTags('Profile')
@ApiBearerAuth('bearer')
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'The calling account’s own profile.' })
  @ApiOkResponse({ type: MeViewDto })
  @ApiProblemResponses()
  me(@CurrentPrincipal() principal: AuthPrincipal): Promise<MeView> {
    return this.profiles.getMe(principal.userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update display name and/or bio.' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ type: MeViewDto })
  @ApiProblemResponses({ validation: true })
  updateProfile(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(UpdateProfileDto)) body: UpdateProfileBody,
  ): Promise<MeView> {
    return this.profiles.updateProfile(principal.userId, body);
  }

  @Put('avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Upload an avatar image (real-type sniffed).' })
  @ApiOkResponse({ type: AvatarUploadedDto })
  @ApiProblemResponses({ statuses: [413, 422] })
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
  @ApiOperation({ summary: 'Remove the avatar.' })
  @ApiNoContentResponse()
  @ApiProblemResponses()
  deleteAvatar(@CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.profiles.deleteAvatar(principal.userId);
  }
}

/**
 * Public profiles, keyed by identifier (technical.md §13). Authentication is
 * still required — these are not anonymous endpoints.
 */
@ApiTags('Profile')
@ApiBearerAuth('bearer')
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly userSummaries: UserSummaryReader,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'User summaries by id.',
    description:
      'One summary per distinct requested id, in request order. An unknown or deleted id is summarised like a deleted account (null `identifier`, `displayName` and `avatarUrl`).',
  })
  @ApiQuery({
    name: 'ids',
    required: true,
    type: String,
    description: 'Comma-separated list of 1 to 100 user ids.',
  })
  @ApiOkResponse({ type: UserSummaryListViewDto })
  @ApiProblemResponses({ validation: true })
  async summaries(
    @Query(new ZodValidationPipe(UserSummariesQuerySchema)) query: UserSummariesQuery,
  ): Promise<UserSummaryListView> {
    const summaries = await this.userSummaries.readMany(query.ids);

    return { items: query.ids.map((id) => summaries.get(id)).filter((s) => s !== undefined) };
  }

  @Get(':identifier')
  @ApiOperation({ summary: 'A public profile by `name/server` identifier.' })
  @ApiOkResponse({ type: PublicProfileViewDto })
  @ApiProblemResponses({ statuses: [404] })
  publicProfile(@Param('identifier') identifier: string): Promise<PublicProfileView> {
    return this.profiles.getPublicProfile(identifier);
  }

  @Get(':identifier/avatar')
  @ApiOperation({ summary: 'Stream a user’s avatar image (content-addressed `ETag`).' })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiProblemResponses({ statuses: [404] })
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
