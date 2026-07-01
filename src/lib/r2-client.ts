// r2-client.ts — R2 S3 兼容 API 客户端（手写 AWS Signature V4）
// 被 r2/ 下各脚本复用，消除代码重复
import crypto from 'node:crypto';
import { env } from './config.js';
import { R2Error } from './errors.js';
import { fetchWithRetry } from './retry.js';
import type { UploadOptions, ListedObject } from './types.js';

// ===== 环境变量 & 常量 =====
// 保持向后兼容的命名导出（部分脚本用 CF_ACCOUNT_ID）
export const accountId = env.R2_ACCOUNT_ID ?? env.CF_ACCOUNT_ID ?? '';
export const accessKeyId = env.R2_KEY_ID;
export const secretAccessKey = env.R2_SECRET_KEY;
export const bucketName = env.R2_HOMEPAGE_BUCKET;
export const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`;
export const cdnBase = 'https://img-homepage.openserve.cloud';
export const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// ===== 签名工具 =====

export function getSignatureKey(key: string, dateStamp: string): Buffer {
  const kDate = crypto
    .createHmac('sha256', 'AWS4' + key)
    .update(dateStamp)
    .digest();
  const kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

export function formatDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * AWS Signature V4 签名（支持额外自定义 header）
 */
export function signRequest(
  method: string,
  uri: string,
  query: string,
  bodyHash: string,
  date: Date,
  extraHeaders?: Record<string, string>,
): { authorization: string; amzDate: string } {
  const amzDate = formatDate(date);
  const dateStamp = amzDate.slice(0, 8);

  // 组装 header 列表并排序
  const headerEntries: [string, string][] = [
    ['host', host],
    ['x-amz-content-sha256', bodyHash],
    ['x-amz-date', amzDate],
  ];
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      headerEntries.push([k.toLowerCase(), v]);
    }
  }
  headerEntries.sort((a, b) => a[0].localeCompare(b[0]));

  const canonicalHeaders = headerEntries.map(([k, v]) => k + ':' + v).join('\n') + '\n';
  const signedHeaders = headerEntries.map(([k]) => k).join(';');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = dateStamp + '/auto/s3/aws4_request';
  const canonicalRequest =
    method +
    '\n' +
    uri +
    '\n' +
    query +
    '\n' +
    canonicalHeaders +
    '\n' +
    signedHeaders +
    '\n' +
    bodyHash;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign =
    algorithm + '\n' + amzDate + '\n' + credentialScope + '\n' + hashedCanonicalRequest;
  const signingKey = getSignatureKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    authorization:
      algorithm +
      ' Credential=' +
      accessKeyId +
      '/' +
      credentialScope +
      ', SignedHeaders=' +
      signedHeaders +
      ', Signature=' +
      signature,
    amzDate,
  };
}

// ===== 通用 R2 操作 =====

/**
 * 列出 R2 桶中所有对象的 key
 */
export async function listAllKeys(prefix?: string): Promise<string[]> {
  const keys: string[] = [];
  let marker = '';
  while (true) {
    let query = 'max-keys=1000';
    if (prefix) query += '&prefix=' + encodeURIComponent(prefix);
    if (marker) query += '&marker=' + encodeURIComponent(marker);
    const { authorization, amzDate } = signRequest('GET', '/', query, emptyPayloadHash, new Date());
    const url = 'https://' + host + '/?' + query;
    const resp = await fetchWithRetry(
      url,
      {
        headers: {
          Authorization: authorization,
          'x-amz-content-sha256': emptyPayloadHash,
          'x-amz-date': amzDate,
          Host: host,
        },
      },
      { timeoutMs: 15000 },
    );
    if (!resp.ok) {
      throw new R2Error(`R2 list failed: HTTP ${resp.status}`, { prefix, status: resp.status });
    }
    const xml = await resp.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      keys.push(m[1]);
    }
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const next = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = next ? next[1] : '';
  }
  return keys;
}

/**
 * 列出 R2 桶中所有对象（带元数据）
 */
export async function listObjects(prefix?: string): Promise<ListedObject[]> {
  const objects: ListedObject[] = [];
  let marker = '';
  while (true) {
    let query = 'max-keys=1000';
    if (prefix) query += '&prefix=' + encodeURIComponent(prefix);
    if (marker) query += '&marker=' + encodeURIComponent(marker);
    const { authorization, amzDate } = signRequest('GET', '/', query, emptyPayloadHash, new Date());
    const url = 'https://' + host + '/?' + query;
    const resp = await fetchWithRetry(
      url,
      {
        headers: {
          Authorization: authorization,
          'x-amz-content-sha256': emptyPayloadHash,
          'x-amz-date': amzDate,
          Host: host,
        },
      },
      { timeoutMs: 15000 },
    );
    if (!resp.ok) {
      throw new R2Error(`R2 list objects failed: HTTP ${resp.status}`, {
        prefix,
        status: resp.status,
      });
    }
    const xml = await resp.text();

    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const content = m[1];
      const keyMatch = content.match(/<Key>([^<]+)<\/Key>/);
      const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
      const lastModifiedMatch = content.match(/<LastModified>([^<]+)<\/LastModified>/);
      const etagMatch = content.match(/<ETag>"?([^"<]+)"?<\/ETag>/);
      if (keyMatch) {
        objects.push({
          key: keyMatch[1],
          size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
          lastModified: lastModifiedMatch ? new Date(lastModifiedMatch[1]) : new Date(0),
          etag: etagMatch ? etagMatch[1] : '',
        });
      }
    }

    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const next = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = next ? next[1] : '';
  }
  return objects;
}

/**
 * 上传对象到 R2
 */
export async function uploadToR2(
  key: string,
  body: Buffer | string,
  options?: UploadOptions,
): Promise<boolean> {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const contentType = options?.contentType;
  const extraHeaders = contentType ? { 'content-type': contentType } : undefined;
  const { authorization, amzDate } = signRequest(
    'PUT',
    '/' + key,
    '',
    bodyHash,
    new Date(),
    extraHeaders,
  );
  const url = 'https://' + host + '/' + key;
  const resp = await fetchWithRetry(
    url,
    {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'x-amz-content-sha256': bodyHash,
        'x-amz-date': amzDate,
        Host: host,
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(options?.metadata
          ? Object.fromEntries(
              Object.entries(options.metadata).map(([k, v]) => [`x-amz-meta-${k}`, v]),
            )
          : {}),
      },
      body: body as any,
    },
    { timeoutMs: 30000 },
  );
  if (!resp.ok) {
    const respBody = await resp.text().catch(() => '(unable to read body)');
    throw new R2Error(`R2 PUT failed: HTTP ${resp.status} — ${respBody.slice(0, 300)}`, {
      key,
      status: resp.status,
    });
  }
  return true;
}

/**
 * 删除 R2 对象
 */
export async function deleteObject(key: string): Promise<boolean> {
  const encodedKey = key
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/');
  const { authorization, amzDate } = signRequest(
    'DELETE',
    '/' + encodedKey,
    '',
    emptyPayloadHash,
    new Date(),
  );
  const url = 'https://' + host + '/' + encodedKey;
  const resp = await fetchWithRetry(
    url,
    {
      method: 'DELETE',
      headers: {
        Authorization: authorization,
        'x-amz-content-sha256': emptyPayloadHash,
        'x-amz-date': amzDate,
        Host: host,
      },
    },
    { timeoutMs: 15000 },
  );
  if (!resp.ok && resp.status !== 204) {
    throw new R2Error(`R2 DELETE failed: HTTP ${resp.status}`, { key, status: resp.status });
  }
  return true;
}
