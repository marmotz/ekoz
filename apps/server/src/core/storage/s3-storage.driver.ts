import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignGetOptions, StorageDriver } from './storage-driver.js';

export interface S3StorageDriverOptions {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

/**
 * S3-compatible {@link StorageDriver} (technical.md §S3), selected when
 * `storage.driver = "s3"`. `put` uses a multipart upload (via `@aws-sdk/lib-storage`,
 * which picks single-part vs multipart automatically), `get` streams the object
 * body, `delete` is idempotent (S3 `DeleteObject` already is), and `presignGet`
 * signs a time-limited GET with optional `response-content-*` overrides.
 */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageDriverOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region ?? 'us-east-1',
      forcePathStyle: options.forcePathStyle,
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
          : undefined,
    });
  }

  async put(key: string, body: NodeJS.ReadableStream, contentType: string): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: body as Readable, ContentType: contentType },
    });
    await upload.done();
  }

  async get(key: string): Promise<NodeJS.ReadableStream> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));

    return result.Body as NodeJS.ReadableStream;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async presignGet(
    key: string,
    ttlSeconds: number,
    options?: PresignGetOptions,
  ): Promise<string | null> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: options?.contentDisposition,
      ResponseContentType: options?.contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  async healthCheck(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
