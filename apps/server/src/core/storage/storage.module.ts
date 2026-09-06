import { Global, Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { BlobAccessRegistry } from './blob-access.registry.js';
import { BlobGcService } from './blob-gc.service.js';
import { BlobController } from './blob.controller.js';
import { BlobService } from './blob.service.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage-driver.js';

/**
 * Object storage (technical.md §6, ADR 0011): the configured {@link StorageDriver}
 * (only `local` is implemented; `s3` is config-schema only), the deduplicating
 * {@link BlobService}, the {@link BlobGcService} sweep, and the `GET /blobs/:id`
 * endpoint with its pluggable {@link BlobAccessRegistry}.
 *
 * Global so referencing features (identity avatars, content-and-sharing
 * attachments) inject `BlobService` / `BlobAccessRegistry` without re-importing.
 */
@Global()
@Module({
  controllers: [BlobController],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageDriver => {
        const driver = config.get('storage.driver');
        if (driver === 's3') {
          throw new Error('storage.driver = "s3" is not implemented yet (technical.md §6); use "local"');
        }

        return new LocalStorageDriver(config.get('storage.local.path'));
      },
    },
    BlobService,
    BlobGcService,
    BlobAccessRegistry,
  ],
  exports: [BlobService, BlobAccessRegistry, STORAGE_DRIVER],
})
export class StorageModule {}
