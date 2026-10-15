import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { ObjectStorage, PresignedUpload } from '@weft/core'

export interface S3StorageConfig {
  /** Endpoint the server uses (e.g. http://seaweedfs:8333 inside Docker). */
  endpoint: string
  /** Endpoint browsers use for presigned URLs (e.g. https://storage.example.com). */
  publicEndpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

function createClient(config: S3StorageConfig, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Only add checksums we ask for: the SDK default bakes a CRC32 of an empty body into
    // presigned PUT URLs, which the browser upload would then fail.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

const isNotFound = (error: unknown) =>
  error instanceof S3ServiceException &&
  (error.$metadata.httpStatusCode === 404 || error.name === 'NotFound')

/** ObjectStorage on any S3-compatible service (SeaweedFS, Garage, R2, AWS S3). */
export class S3ObjectStorage implements ObjectStorage {
  private readonly internal: S3Client
  /** Signs URLs for the public host; it never sends requests itself. */
  private readonly signer: S3Client

  constructor(private readonly config: S3StorageConfig) {
    this.internal = createClient(config, config.endpoint)
    this.signer = createClient(config, config.publicEndpoint)
  }

  async presignPut(
    key: string,
    options: { byteLength: number; sha256: string; contentType: string; expiresInSeconds: number },
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.byteLength,
      // Bound into the signature: the storage rejects a body whose SHA-256 differs.
      ChecksumSHA256: options.sha256,
    })
    const url = await getSignedUrl(this.signer, command, { expiresIn: options.expiresInSeconds })
    return { url, expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000) }
  }

  presignGet(key: string, options: { expiresInSeconds: number }): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      {
        expiresIn: options.expiresInSeconds,
      },
    )
  }

  async head(key: string): Promise<{ byteLength: number } | null> {
    try {
      const result = await this.internal.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      )
      return { byteLength: result.ContentLength ?? 0 }
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  /** Creates the bucket if needed and allows browser uploads/playback from the app's origins. */
  async ensureBucket(options: { corsOrigins: string[] }): Promise<void> {
    const Bucket = this.config.bucket
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket }))
    } catch (error) {
      if (!isNotFound(error)) throw error
      await this.internal.send(new CreateBucketCommand({ Bucket }))
    }
    await this.internal.send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: options.corsOrigins,
              AllowedMethods: ['GET', 'HEAD', 'PUT'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    )
  }
}
