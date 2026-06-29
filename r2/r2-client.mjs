// r2-client.mjs — R2 S3 兼容 API 客户端（手写 AWS Signature V4）
// 被 r2/ 下各脚本复用，消除代码重复
import crypto from 'crypto';

// ===== 环境变量 & 常量 =====
export const accountId = process.env.CF_ACCOUNT_ID || '';
export const accessKeyId = process.env.R2_KEY_ID || '';
export const secretAccessKey = process.env.R2_SECRET_KEY || '';
export const bucketName = process.env.R2_HOMEPAGE_BUCKET || 'homepage-bg';
export const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';
export const cdnBase = 'https://img-homepage.openserve.cloud';
export const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// ===== 签名工具 =====

export function getSignatureKey(key, dateStamp) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

export function formatDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * AWS Signature V4 签名（支持额外自定义 header）
 * @param {string} method  - HTTP method（GET, PUT, DELETE 等）
 * @param {string} uri     - 请求路径（如 '/' 或 '/key'）
 * @param {string} query   - URL 查询字符串（如 'max-keys=1000'）
 * @param {string} bodyHash - 请求体 SHA256 十六进制
 * @param {Date}   date    - 签名时间
 * @param {Object} [extraHeaders] - 额外需要签名的 header（如 { 'content-type': 'image/jpeg' }）
 * @returns {{ authorization: string, amzDate: string }}
 */
export function signRequest(method, uri, query, bodyHash, date, extraHeaders) {
  const amzDate = formatDate(date);
  const dateStamp = amzDate.slice(0, 8);

  // 组装 header 列表并排序
  const headerEntries = [
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
  const canonicalRequest = method + '\n' + uri + '\n' + query + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + bodyHash;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = algorithm + '\n' + amzDate + '\n' + credentialScope + '\n' + hashedCanonicalRequest;
  const signingKey = getSignatureKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    authorization: algorithm + ' Credential=' + accessKeyId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature,
    amzDate,
  };
}

// ===== 通用 R2 操作 =====

/**
 * 列出 R2 桶中所有对象的 key
 * @param {string} [prefix] - 可选前缀过滤
 * @returns {Promise<string[]>}
 */
export async function listAllKeys(prefix) {
  const keys = [];
  let marker = '';
  while (true) {
    let query = 'max-keys=1000';
    if (prefix) query += '&prefix=' + encodeURIComponent(prefix);
    if (marker) query += '&marker=' + encodeURIComponent(marker);
    const { authorization, amzDate } = signRequest('GET', '/', query, emptyPayloadHash, new Date());
    const url = 'https://' + host + '/?' + query;
    const resp = await fetch(url, {
      headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
    });
    if (!resp.ok) {
      console.error('R2 list failed: HTTP ' + resp.status);
      break;
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
 * 上传对象到 R2
 * @param {string} key - 对象键（如 'normal/12345.jpg'）
 * @param {Buffer|string} body - 内容
 * @param {string} [contentType] - MIME 类型
 * @returns {Promise<boolean>}
 */
export async function uploadToR2(key, body, contentType) {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const extraHeaders = contentType ? { 'content-type': contentType } : undefined;
  const { authorization, amzDate } = signRequest('PUT', '/' + key, '', bodyHash, new Date(), extraHeaders);
  const url = 'https://' + host + '/' + key;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': authorization,
      'x-amz-content-sha256': bodyHash,
      'x-amz-date': amzDate,
      'Host': host,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body,
  });
  if (!resp.ok) {
    const respBody = await resp.text().catch(() => '(unable to read body)');
    console.error('  R2 PUT failed: HTTP ' + resp.status);
    console.error('  Response: ' + respBody.slice(0, 300));
  }
  return resp.ok;
}

/**
 * 删除 R2 对象
 * @param {string} key - 对象键
 * @returns {Promise<boolean>}
 */
export async function deleteObject(key) {
  const encodedKey = key.split('/').map(p => encodeURIComponent(p)).join('/');
  const { authorization, amzDate } = signRequest('DELETE', '/' + encodedKey, '', emptyPayloadHash, new Date());
  const url = 'https://' + host + '/' + encodedKey;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
  });
  return resp.ok || resp.status === 204;
}
