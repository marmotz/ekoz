import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '../../../core/config/config.service.js';
import { Public } from '../../../core/http/public.decorator.js';
import { MIN_PASSWORD_LENGTH } from '../accounts/password.service.js';
import { type AuthPolicyBody, AuthPolicyDto } from './auth-policy.dto.js';

/**
 * Public authentication policy probe. Both settings are hot-reloadable, so they
 * are read from {@link ConfigService} on every call and never cached
 * (`no-store`): a change made by the owner shows on the next request. Nothing
 * secret is exposed, the same facts are observable by trying to register.
 */
@ApiTags('Auth')
@Controller('auth/policy')
export class AuthPolicyController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Registration mode, verification requirement and password policy.' })
  @ApiOkResponse({ type: AuthPolicyDto })
  policy(): AuthPolicyBody {
    return {
      registrationMode: this.config.get('registration.mode'),
      emailVerificationRequired: this.config.get('email.verification_required'),
      passwordMinLength: MIN_PASSWORD_LENGTH,
      linkPreviews: this.config.get('link_previews.enabled'),
    };
  }
}
