// delete-non-lolicon.mjs
// 从 R2 删除非 Lolicon 图片
import crypto from 'crypto';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_IMAGES_BUCKET || 'homepage-bg';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

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

function parseXmlObjects(xml) {
  const objects = [];
  const contents = xml.split('<Contents>');
  for (let i = 1; i < contents.length; i++) {
    const block = contents[i].split('</Contents>')[0];
    const keyMatch = block.match(/<Key>([^<]+)<\/Key>/);
    const sizeMatch = block.match(/<Size>(\d+)<\/Size>/);
    if (keyMatch) objects.push({ key: keyMatch[1], size: parseInt(sizeMatch?.[1] || '0') });
  }
  return objects;
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
    if (!resp.ok) { console.error('R2 list failed:', resp.status); break; }
    const xml = await resp.text();
    objects.push(...parseXmlObjects(xml));
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const nextMarkerMatch = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = nextMarkerMatch ? nextMarkerMatch[1] : '';
    console.log('Listed ' + objects.length + ' objects...');
  }
  return objects;
}

async function checkLolicon(pid) {
  try {
    const resp = await fetch('https://api.lolicon.app/setu/v2?num=1&pid=' + pid);
    if (resp.status === 403) {
      await new Promise(r => setTimeout(r, 2000));
      const resp2 = await fetch('https://api.lolicon.app/setu/v2?num=1&pid=' + pid);
      const data = await resp2.json();
      return data.data && data.data.length > 0;
    }
    const data = await resp.json();
    return data.data && data.data.length > 0;
  } catch (e) {
    return null;
  }
}

async function deleteObject(key) {
  const { authorization, amzDate } = signRequest('DELETE', '/' + encodeURIComponent(key).replace(/%2F/g, '/'), '', emptyPayloadHash, new Date());
  const url = 'https://' + host + '/' + encodeURIComponent(key).replace(/%2F/g, '/');
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

  console.log('Step 1: 列出 R2 所有图片...');
  const allObjects = await listAllObjects();
  const imageFiles = allObjects.filter(obj => {
    const ext = obj.key.toLowerCase().split('.').pop();
    return imageExtensions.includes('.' + ext);
  });
  console.log('共 ' + imageFiles.length + ' 张图片');

  console.log('\nStep 2: 用 Lolicon API 检查...');
  const toDelete = [];
  const toKeep = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const obj = imageFiles[i];
    const filename = obj.key.split('/').pop();
    const pid = filename.replace(/\.[^.]+$/, '');

    process.stdout.write('[' + (i + 1) + '/' + imageFiles.length + '] ' + pid + '... ');

    const exists = await checkLolicon(pid);
    if (exists === true) {
      console.log('KEEP');
      toKeep.push(obj.key);
    } else if (exists === false) {
      console.log('DELETE');
      toDelete.push(obj.key);
    } else {
      console.log('ERROR (keeping)');
      toKeep.push(obj.key);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n========== 检查结果 ==========');
  console.log('保留: ' + toKeep.length + ' 张');
  console.log('删除: ' + toDelete.length + ' 张');

  if (toDelete.length === 0) {
    console.log('没有需要删除的图片');
    return;
  }

  console.log('\nStep 3: 删除非 Lolicon 图片...');
  let deleted = 0;
  let failed = 0;

  for (const key of toDelete) {
    process.stdout.write('Deleting ' + key + '... ');
    const ok = await deleteObject(key);
    if (ok) {
      console.log('OK');
      deleted++;
    } else {
      console.log('FAILED');
      failed++;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n========== 完成 ==========');
  console.log('成功删除: ' + deleted + ' 张');
  console.log('删除失败: ' + failed + ' 张');
  console.log('保留: ' + toKeep.length + ' 张');
}

main();
