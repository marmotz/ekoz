import { Global, Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { BlobController } from './blob.controller.js';
import { BlobService } from './blob.service.js';
import { BlobAccessRegistry } from './blob-access.registry.js';
import { BlobGcService } from './blob-gc.service.js';
import { FileAccessRegistry } from './file-access.registry.js';
import { FilesController } from './files.controller.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { MediaAnnotationService } from './media-annotation.service.js';
import { MediaToolsService } from './media-tools.service.js';
import { MyStorageController } from './my-storage.controller.js';
import { S3StorageDriver } from './s3-storage.driver.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage-driver.js';
import { StorageQuotaService } from './storage-quota.service.js';
import { UploadController } from './upload.controller.js';
import { UploadService } from './upload.service.js';
import { UploadSweeperService } from './upload-sweeper.service.js';

/**
 * Object storage (technical.md §S3, ADR 0011): the configured {@link StorageDriver}
 * (`local` or `s3`), the deduplicating {@link BlobService}, the
 * {@link BlobGcService} sweep, and the `GET /blobs/:id` endpoint with its
 * pluggable {@link BlobAccessRegistry}.
 *
 * Global so referencing features (identity avatars, content-and-sharing
 * attachments) inject `BlobService` / `BlobAccessRegistry` without re-importing.
 */
@Global()
@Module({
  controllers: [BlobController, MyStorageController, UploadController, FilesController],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageDriver => {
        if (config.get('storage.driver') === 's3') {
          return new S3StorageDriver({
            endpoint: config.get('storage.s3.endpoint'),
            region: config.get('storage.s3.region'),
            bucket: requireS3Key(config, 'storage.s3.bucket'),
            accessKeyId: config.get('storage.s3.access_key_id'),
            secretAccessKey: config.get('storage.s3.secret_access_key'),
            forcePathStyle: config.get('storage.s3.force_path_style'),
          });
        }

        return new LocalStorageDriver(config.get('storage.local.path'));
      },
    },
    BlobService,
    BlobGcService,
    BlobAccessRegistry,
    StorageQuotaService,
    MediaToolsService,
    MediaAnnotationService,
    UploadService,
    UploadSweeperService,
    FileAccessRegistry,
  ],
  exports: [
    BlobService,
    BlobAccessRegistry,
    STORAGE_DRIVER,
    StorageQuotaService,
    UploadService,
    MediaToolsService,
    FileAccessRegistry,
  ],
})
export class StorageModule {}

function requireS3Key(config: ConfigService, key: 'storage.s3.bucket'): string {
  const value = config.get(key);
  if (!value) {
    throw new Error(`${key} is required when storage.driver = "s3"`);
  }

  return value;
}
