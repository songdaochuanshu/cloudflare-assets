// migrate-to-prefix.mjs
// 将 R2 桶根目录下的图片迁移到 r18/ 前缀下
import crypto from 'crypto';

const accountId = process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_KEY;
const bucketName = process.env.R2_HOMEPAGE_BUCKET || 'homepage-bg';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';
const PREFIX = 'r18/';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function getSignatureKey(key, dateStamp) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

function formatDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function signRequest(method, uri, query, bodyHash, date, extraHeaders) {
  const amzDate = formatDate(date);
  const dateStamp = amzDate.slice(0, 8);
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

async function listAllObjects() {
  const objects = [];
  let marker = '';
  while (true) {
    let query = 'max-keys=1000';
    if (marker) query += '&marker=' + encodeURIComponent(marker);
    const { authorization, amzDate } = signRequest('GET', '/', query, emptyPayloadHash, new Date());
    const url = 'https://' + host + '/?' + query;
    const resp = await fetch(url, {
      headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
    });
    if (!resp.ok) break;
    const xml = await resp.text();
    const matches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
    const sizeMatches = xml.matchAll(/<Size>(\d+)<\/Size>/g);
    const keys = [...matches].map(m => m[1]);
    const sizes = [...sizeMatches].map(m => parseInt(m[1]));
    for (let i = 0; i < keys.length; i++) {
      objects.push({ key: keys[i], size: sizes[i] || 0 });
    }
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const nextMarkerMatch = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = nextMarkerMatch ? nextMarkerMatch[1] : '';
  }
  return objects;
}

async function copyObject(srcKey, destKey, contentType) {
  const { authorization, amzDate } = signRequest('PUT', '/' + destKey, '', emptyPayloadHash, new Date(), { 'content-type': contentType });
  const url = 'https://' + host + '/' + destKey;
  // R2 copy: download then upload
  const getAuth = signRequest('GET', '/' + srcKey, '', emptyPayloadHash, new Date());
  const getResp = await fetch('https://' + host + '/' + srcKey, {
    headers: { 'Authorization': getAuth.authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': getAuth.amzDate, 'Host': host },
  });
  if (!getResp.ok) return false;
  const body = Buffer.from(await getResp.arrayBuffer());
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const putAuth = signRequest('PUT', '/' + destKey, '', bodyHash, new Date(), { 'content-type': contentType });
  const putResp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': putAuth.authorization,
      'x-amz-content-sha256': bodyHash,
      'x-amz-date': putAuth.amzDate,
      'Host': host,
      'Content-Type': contentType,
    },
    body,
  });
  return putResp.ok;
}

async function deleteObject(key) {
  const encodedKey = key.split('/').map(p => encodeURIComponent(p)).join('/');
  const { authorization, amzDate } = signRequest('DELETE', '/' + encodedKey, '', emptyPayloadHash, new Date());
  const url = 'https://' + host + '/' + encodedKey;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
  });
  return resp.ok || resp.status === 204;
}

async function main() {
  console.log('=== 迁移图片到 r18/ 前缀 ===');
  console.log('');

  console.log('获取 R2 文件列表...');
  const allObjects = await listAllObjects();
  console.log('R2 中总文件数: ' + allObjects.length);

  // 筛选根目录下的图片文件（不含子目录）
  const rootImages = allObjects.filter(obj => {
    if (obj.key.includes('/')) return false; // 跳过已有前缀的文件
    const ext = obj.key.toLowerCase().split('.').pop();
    return IMAGE_EXTENSIONS.includes('.' + ext);
  });
  console.log('根目录下需要迁移的图片: ' + rootImages.length + ' 张');

  if (rootImages.length === 0) {
    console.log('没有需要迁移的文件');
    return;
  }

  let migrated = 0;
  let failed = 0;

  for (const obj of rootImages) {
    const destKey = PREFIX + obj.key;
    const ext = obj.key.split('.').pop();
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

    process.stdout.write('迁移 ' + obj.key + ' -> ' + destKey + '... ');
    const ok = await copyObject(obj.key, destKey, contentType);
    if (ok) {
      console.log('OK');
      migrated++;
    } else {
      console.log('FAILED');
      failed++;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n========== 迁移完成 ==========');
  console.log('成功: ' + migrated + ' 张');
  console.log('失败: ' + failed + ' 张');

  if (migrated > 0) {
    console.log('\n提示：迁移后可手动删除根目录下的旧文件');
    console.log('（为安全起见，暂不自动删除）');
  }
}

main();
