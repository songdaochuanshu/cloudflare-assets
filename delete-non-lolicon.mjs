// delete-non-lolicon.mjs
// 根据 images-info-export.json 中的 PID 列表，从 R2 删除对应图片
import crypto from 'crypto';
import { readFileSync } from 'fs';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_IMAGES_BUCKET || 'homepage-bg';
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

// 列出 R2 中所有文件
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
    if (!resp.ok) { console.error('List failed:', resp.status); break; }
    const xml = await resp.text();
    const matches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
    for (const m of matches) keys.push(m[1]);
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const nextMarkerMatch = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = nextMarkerMatch ? nextMarkerMatch[1] : '';
  }
  return keys;
}

// 删除 R2 中的文件
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
  console.log('=== 非 Lolicon 图片删除工具 ===');
  console.log('Bucket: ' + bucketName);
  console.log('');

  // 读取要删除的图片列表
  const deleteList = JSON.parse(readFileSync('images-info-export.json', 'utf8'));
  const deletePids = new Set(deleteList.map(item => String(item.pid)));
  console.log('要删除的图片 PID 数量: ' + deletePids.size);

  // 列出 R2 中所有文件
  console.log('\n获取 R2 文件列表...');
  const allKeys = await listAllKeys();
  console.log('R2 中总文件数: ' + allKeys.length);

  // 找出需要删除的文件
  const toDelete = allKeys.filter(key => {
    const filename = key.split('/').pop();
    const pid = filename.replace(/\.[^.]+$/, '');
    return deletePids.has(pid);
  });
  console.log('匹配到需要删除的文件: ' + toDelete.length + ' 个');

  if (toDelete.length === 0) {
    console.log('没有需要删除的文件');
    return;
  }

  // 显示前 10 个
  console.log('\n前 10 个文件:');
  toDelete.slice(0, 10).forEach(key => console.log('  ' + key));
  if (toDelete.length > 10) console.log('  ... 还有 ' + (toDelete.length - 10) + ' 个');

  // 开始删除
  console.log('\n开始删除...');
  let deleted = 0;
  let failed = 0;

  for (const key of toDelete) {
    process.stdout.write('删除 ' + key + '... ');
    const ok = await deleteObject(key);
    if (ok) {
      console.log('OK');
      deleted++;
    } else {
      console.log('FAILED');
      failed++;
    }
    // 避免太快
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n========== 完成 ==========');
  console.log('成功删除: ' + deleted + ' 个');
  console.log('删除失败: ' + failed + ' 个');
  console.log('R2 剩余文件: ' + (allKeys.length - deleted) + ' 个');
}

main();
