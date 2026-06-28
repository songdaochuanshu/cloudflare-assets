// delete-images.mjs
// 从 R2 删除指定的图片文件
import crypto from 'crypto';
import { readFileSync } from 'fs';

const accountId = process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_KEY;
const bucketName = process.env.R2_HOMEPAGE_BUCKET || 'homepage-bg';
const R2_PREFIX = 'r18/';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';

function getSignatureKey(key, dateStamp) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

function formatDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

async function deleteObject(key) {
  const now = new Date();
  const amzDate = formatDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = '/' + encodeURIComponent(key).replace(/%2F/g, '/');
  const canonicalQueryString = '';
  const canonicalHeaders = 'host:' + host + '\nx-amz-content-sha256:' + emptyPayloadHash + '\nx-amz-date:' + amzDate + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = 'DELETE\n' + canonicalUri + '\n' + canonicalQueryString + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + emptyPayloadHash;
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = dateStamp + '/auto/s3/aws4_request';
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = algorithm + '\n' + amzDate + '\n' + credentialScope + '\n' + hashedCanonicalRequest;
  const signingKey = getSignatureKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = algorithm + ' Credential=' + accessKeyId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  const url = 'https://' + host + canonicalUri;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': authorization,
      'x-amz-content-sha256': emptyPayloadHash,
      'x-amz-date': amzDate,
      'Host': host,
    },
  });
  return resp.status === 204 || resp.status === 200;
}

async function main() {
  const files = readFileSync('files_to_delete.txt', 'utf8').split('\n').filter(f => f.trim());
  console.log('要删除 ' + files.length + ' 个文件');
  let success = 0;
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    const filename = files[i].trim();
    process.stdout.write('[' + (i + 1) + '/' + files.length + '] Deleting ' + R2_PREFIX + filename + '... ');
    try {
      const ok = await deleteObject(R2_PREFIX + filename);
      if (ok) { console.log('OK'); success++; }
      else { console.log('FAILED'); failed++; }
    } catch (e) { console.log('ERROR: ' + e.message); failed++; }
    await new Promise(r => setTimeout(r, 100));
  }
  console.log('\n========== 结果 ==========');
  console.log('成功: ' + success);
  console.log('失败: ' + failed);
}

main();
