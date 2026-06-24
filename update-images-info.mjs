// update-images-info.mjs
// 从 R2 homepage-bg 桶列出所有图片，生成/覆盖 images-info.json
import crypto from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_IMAGES_BUCKET || 'homepage-bg';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';
const customDomain = 'https://img-homepage.openserve.cloud';

function getSignatureKey(key, dateStamp) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

function formatDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function signRequest(method, uri, query, bodyHash, date) {
  const amzDate = formatDate(date);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders = 'host:' + host + '\nx-amz-content-sha256:' + bodyHash + '\nx-amz-date:' + amzDate + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = method + '\n' + uri + '\n' + query + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + bodyHash;
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = dateStamp + '/auto/s3/aws4_request';
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = algorithm + '\n' + amzDate + '\n' + credentialScope + '\n' + hashedCanonicalRequest;
  const signingKey = getSignatureKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return {
    authorization: algorithm + ' Credential=' + accessKeyId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature,
    amzDate,
  };
}

async function listAllKeys() {
  const keys = [];
  let marker = '';
  while (true) {
    let query = 'max-keys=1000';
    if (marker) query += '&marker=' + encodeURIComponent(marker);
    const { authorization, amzDate } = signRequest('GET', '/', query, emptyPayloadHash, new Date());
    const url = 'https://' + host + '/?' + query;
    const resp = await fetch(url, {
      headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
    });
    if (!resp.ok) { console.error('List failed:', resp.status, await resp.text()); break; }
    const xml = await resp.text();
    const matches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
    for (const m of matches) keys.push(m[1]);
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const nextMarkerMatch = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = nextMarkerMatch ? nextMarkerMatch[1] : '';
  }
  return keys;
}

async function main() {
  console.log('=== R2 图片链接更新工具 ===');
  console.log('Bucket: ' + bucketName);
  console.log('');

  console.log('获取 R2 文件列表...');
  const allKeys = await listAllKeys();
  console.log('R2 中总文件数: ' + allKeys.length);

  // 构建 images-info.json
  const imagesInfo = allKeys.map(key => {
    const filename = key.split('/').pop();
    const pid = filename.replace(/\.[^.]+$/, '');
    const ext = filename.split('.').pop();
    const url = customDomain + '/' + filename;
    return {
      pid: parseInt(pid),
      filename: filename,
      url: url,
      title: '',
      author: '',
      width: 0,
      height: 0,
      tags: [],
      ext: ext,
      size_kb: 0,
      downloaded: true,
    };
  }).sort((a, b) => a.pid - b.pid);

  // 写入 JSON
  writeFileSync('images-info.json', JSON.stringify(imagesInfo, null, 2), 'utf8');
  console.log('已写入 images-info.json (' + imagesInfo.length + ' 条记录)');

  // 打印前 5 条作为示例
  console.log('\n前 5 条示例:');
  imagesInfo.slice(0, 5).forEach(img => {
    console.log(`  PID: ${img.pid}, File: ${img.filename}, URL: ${img.url}`);
  });
}

main();
