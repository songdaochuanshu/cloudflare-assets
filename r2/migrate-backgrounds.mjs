// migrate-backgrounds.mjs
// 将 backgrounds/ 重命名为 normal/，清理根目录旧文件
import crypto from 'crypto';

const accountId = process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_KEY;
const bucketName = process.env.R2_HOMEPAGE_BUCKET || 'homepage-bg';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function getSignatureKey(key, dateStamp) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

function formatDate(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

function signRequest(method, uri, query, bodyHash, date, extraHeaders) {
  const amzDate = formatDate(date);
  const dateStamp = amzDate.slice(0, 8);
  const headerEntries = [['host', host], ['x-amz-content-sha256', bodyHash], ['x-amz-date', amzDate]];
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) headerEntries.push([k.toLowerCase(), v]);
  headerEntries.sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalHeaders = headerEntries.map(([k, v]) => k + ':' + v).join('\n') + '\n';
  const signedHeaders = headerEntries.map(([k]) => k).join(';');
  const canonicalRequest = method + '\n' + uri + '\n' + query + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + bodyHash;
  const credentialScope = dateStamp + '/auto/s3/aws4_request';
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + credentialScope + '\n' + hashedCanonicalRequest;
  const signingKey = getSignatureKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return { authorization: 'AWS4-HMAC-SHA256 Credential=' + accessKeyId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature, amzDate };
}

async function listAllObjects() {
  const objects = [];
  let marker = '';
  while (true) {
    let query = 'max-keys=1000';
    if (marker) query += '&marker=' + encodeURIComponent(marker);
    const { authorization, amzDate } = signRequest('GET', '/', query, emptyPayloadHash, new Date());
    const resp = await fetch('https://' + host + '/?' + query, {
      headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
    });
    if (!resp.ok) break;
    const xml = await resp.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      const key = m[1];
      const sizeMatch = xml.match(new RegExp('<Key>' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</Key>.*?<Size>(\\d+)</Size>'));
      objects.push({ key, size: parseInt(sizeMatch?.[1] || '0') });
    }
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const next = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = next ? next[1] : '';
  }
  return objects;
}

async function copyObject(srcKey, destKey, contentType) {
  const getAuth = signRequest('GET', '/' + srcKey, '', emptyPayloadHash, new Date());
  const getResp = await fetch('https://' + host + '/' + srcKey, {
    headers: { 'Authorization': getAuth.authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': getAuth.amzDate, 'Host': host },
  });
  if (!getResp.ok) return false;
  const body = Buffer.from(await getResp.arrayBuffer());
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const putAuth = signRequest('PUT', '/' + destKey, '', bodyHash, new Date(), { 'content-type': contentType });
  const putResp = await fetch('https://' + host + '/' + destKey, {
    method: 'PUT',
    headers: { 'Authorization': putAuth.authorization, 'x-amz-content-sha256': bodyHash, 'x-amz-date': putAuth.amzDate, 'Host': host, 'Content-Type': contentType },
    body,
  });
  return putResp.ok;
}

async function deleteObject(key) {
  const encodedKey = key.split('/').map(p => encodeURIComponent(p)).join('/');
  const { authorization, amzDate } = signRequest('DELETE', '/' + encodedKey, '', emptyPayloadHash, new Date());
  const resp = await fetch('https://' + host + '/' + encodedKey, {
    method: 'DELETE',
    headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
  });
  return resp.ok || resp.status === 204;
}

async function main() {
  console.log('=== 迁移 backgrounds/ → normal/ ===\n');

  console.log('获取 R2 文件列表...');
  const allObjects = await listAllObjects();
  console.log('总文件数: ' + allObjects.length);

  // 1. backgrounds/ → normal/
  const bgFiles = allObjects.filter(o => o.key.startsWith('backgrounds/'));
  console.log('\nbackgrounds/ 下有 ' + bgFiles.length + ' 个文件');

  if (bgFiles.length > 0) {
    let copied = 0, failed = 0;
    for (const obj of bgFiles) {
      const newKey = 'normal/' + obj.key.substring('backgrounds/'.length);
      const ext = obj.key.split('.').pop();
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      process.stdout.write('复制 ' + obj.key + ' → ' + newKey + '... ');
      const ok = await copyObject(obj.key, newKey, contentType);
      if (ok) { console.log('OK'); copied++; }
      else { console.log('FAILED'); failed++; }
      await new Promise(r => setTimeout(r, 50));
    }
    console.log('\n复制完成: ' + copied + ' 成功, ' + failed + ' 失败');

    // 删除 backgrounds/ 下的文件
    console.log('\n删除 backgrounds/ 旧文件...');
    let deleted = 0;
    for (const obj of bgFiles) {
      process.stdout.write('删除 ' + obj.key + '... ');
      const ok = await deleteObject(obj.key);
      if (ok) { console.log('OK'); deleted++; }
      else { console.log('FAILED'); }
      await new Promise(r => setTimeout(r, 50));
    }
    console.log('删除完成: ' + deleted + ' 个');
  }

  // 2. 清理根目录旧图片（排除子目录和非图片文件）
  const rootImages = allObjects.filter(o => {
    if (o.key.includes('/')) return false;
    const ext = o.key.toLowerCase().split('.').pop();
    return IMAGE_EXTENSIONS.includes('.' + ext);
  });
  console.log('\n根目录旧图片: ' + rootImages.length + ' 张');

  if (rootImages.length > 0) {
    let deleted = 0;
    for (const obj of rootImages) {
      process.stdout.write('删除 ' + obj.key + '... ');
      const ok = await deleteObject(obj.key);
      if (ok) { console.log('OK'); deleted++; }
      else { console.log('FAILED'); }
      await new Promise(r => setTimeout(r, 50));
    }
    console.log('删除完成: ' + deleted + ' 个');
  }

  console.log('\n========== 全部完成 ==========');
}

main();
