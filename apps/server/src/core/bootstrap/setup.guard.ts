import { type CanActivate, Injectable } from '@nestjs/common';
import { SetupService } from './setup.service.js';

/**
 * Gate for `/setup/*` routes (technical.md §5). Lets the request through only
 * while setup is open; once an owner exists it raises `410 Gone` — permanently,
 * because {@link SetupService.resolveState} then always returns `closed`.
 *
 * The identity module attaches this to its setup controller with
 * `@UseGuards(SetupGuard)`.
 */
@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private readonly setup: SetupService) {}

  async canActivate(): Promise<boolean> {
    await this.setup.assertOpen();

    return true;
  }
}
