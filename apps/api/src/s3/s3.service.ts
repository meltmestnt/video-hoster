import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

const PUT_TTL = 60 * 15;
// Short GET TTL caps egress damage if a presigned URL leaks or gets scraped:
// any redistributed link expires in 10 minutes. Public videos still work
// because the page is force-dynamic and re-issues a fresh URL on every load.
const GET_TTL = 60 * 10;

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(config: ConfigService) {
    const region = config.getOrThrow<string>("AWS_REGION");
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId: config.getOrThrow<string>("AWS_ACCESS_KEY_ID"),
        secretAccessKey: config.getOrThrow<string>("AWS_SECRET_ACCESS_KEY"),
      },
      // Since @aws-sdk/client-s3 v3.729 the SDK auto-adds CRC32 checksum
      // headers to every PutObject, including presigned URLs. Browsers then
      // send `x-amz-sdk-checksum-algorithm` / `x-amz-checksum-crc32`, which
      // most existing bucket CORS configs don't allow — preflight fails. We
      // don't need server-side integrity checks here, so revert to the old
      // behavior of only sending checksums when AWS requires them.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  presignPut(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: PUT_TTL });
  }

  presignGet(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: GET_TTL });
  }

  async headObject(
    key: string,
  ): Promise<{ size: number; contentType: string | undefined } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: Number(res.ContentLength ?? 0),
        contentType: res.ContentType,
      };
    } catch (err) {
      this.logger.warn(`headObject failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) {
      throw new Error(`S3 object ${key} returned an empty body`);
    }
    await pipeline(res.Body as Readable, createWriteStream(destPath));
  }

  async uploadFile(
    key: string,
    srcPath: string,
    contentType: string,
  ): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(srcPath),
        ContentType: contentType,
      },
    });
    await upload.done();
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * Stream an object back to the caller, optionally with a byte range. Used
   * by the media proxy so the browser only ever sees our own URL — never
   * the S3 bucket directly. The returned shape mirrors the S3 SDK response
   * minus the body so the controller can copy headers without leaking SDK
   * types into HTTP land.
   */
  async getObjectStream(
    key: string,
    range?: string,
  ): Promise<{
    body: Readable;
    contentType: string | undefined;
    contentLength: number | undefined;
    contentRange: string | undefined;
    acceptRanges: string | undefined;
    etag: string | undefined;
    lastModified: Date | undefined;
    cacheControl: string | undefined;
    statusCode: number;
  }> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range,
      }),
    );
    if (!res.Body) {
      throw new Error(`S3 object ${key} returned an empty body`);
    }
    return {
      body: res.Body as Readable,
      contentType: res.ContentType,
      contentLength:
        res.ContentLength != null ? Number(res.ContentLength) : undefined,
      contentRange: res.ContentRange,
      acceptRanges: res.AcceptRanges,
      etag: res.ETag,
      lastModified: res.LastModified,
      cacheControl: res.CacheControl,
      // 206 when S3 honored the Range header, 200 otherwise.
      statusCode: range && res.ContentRange ? 206 : 200,
    };
  }
}
