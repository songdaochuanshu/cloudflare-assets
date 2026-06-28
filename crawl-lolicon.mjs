// crawl-lolicon.mjs
// 从 Lolicon API 爬取 R18 图片，上传到 R2
// 每次运行 5 分钟，每隔 15-20 秒随机下载一张
// 结束后从 R2 重新生成 images-info.json（自动清理假链接）
import crypto from 'crypto';
import { writeFileSync } from 'fs';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_IMAGES_BUCKET || 'homepage-bg';
const cdnBase = 'https://img-homepage.openserve.cloud';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';
const IMAGES_JSON = 'images-info.json';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const RUN_DURATION = 5 * 60 * 1000;
const MIN_DELAY = 15000;
const MAX_DELAY = 20000;

function getSignatureKey(key, dateStamp) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

function formatDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function signRequest(method, uri, query, bodyHash, date, extraHeaders, debug) {
  const amzDate = formatDate(date);
  const dateStamp = amzDate.slice(0, 8);
  // Build header entries: host + extra + x-amz-content-sha256 + x-amz-date (sorted by header name)
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
  if (debug) {
    console.error('--- SIGN DEBUG ---');
    console.error('Method:', method);
    console.error('URI:', uri);
    console.error('Query:', query);
    console.error('SignedHeaders:', signedHeaders);
    console.error('CanonicalRequest:\n' + canonicalRequest);
    console.error('CanonicalRequestHash:', hashedCanonicalRequest);
    console.error('StringToSign:\n' + stringToSign);
    console.error('--- END DEBUG ---');
  }
  const signingKey = getSignatureKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return {
    authorization: algorithm + ' Credential=' + accessKeyId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature,
    amzDate,
  };
}

// 列出 R2 中所有文件，返回 [{ key, size }]
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
    if (!resp.ok) {
      console.error('R2 list failed: HTTP ' + resp.status + ' ' + resp.statusText);
      const errBody = await resp.text().catch(() => '');
      if (errBody) console.error('Response: ' + errBody.slice(0, 500));
      break;
    }
    const xml = await resp.text();
    const keyMatches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
    const sizeMatches = xml.matchAll(/<Size>(\d+)<\/Size>/g);
    const keys = [...keyMatches].map(m => m[1]);
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

// 从 R2 文件列表重新生成 images-info.json（只保留图片文件）
function regenerateImagesJson(allObjects) {
  const imageObjects = allObjects.filter(obj => {
    const ext = obj.key.toLowerCase().split('.').pop();
    return IMAGE_EXTENSIONS.includes('.' + ext);
  });

  const imagesInfo = imageObjects.map(obj => {
    const filename = obj.key.split('/').pop();
    const pid = filename.replace(/\.[^.]+$/, '');
    const ext = filename.split('.').pop();
    return {
      pid: parseInt(pid) || 0,
      filename,
      url: cdnBase + '/' + obj.key,
      title: '',
      author: '',
      width: 0,
      height: 0,
      tags: [],
      ext,
      size_kb: Math.round(obj.size / 1024),
      downloaded: true,
    };
  });

  writeFileSync(IMAGES_JSON, JSON.stringify(imagesInfo, null, 2));
  console.log('已从 R2 重新生成 ' + IMAGES_JSON + '（' + imagesInfo.length + ' 条记录）');
  return imagesInfo;
}

async function uploadToR2(key, body, contentType) {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const { authorization, amzDate } = signRequest('PUT', '/' + key, '', bodyHash, new Date(), { 'content-type': contentType }, true);
  const url = 'https://' + host + '/' + key;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': authorization,
      'x-amz-content-sha256': bodyHash,
      'x-amz-date': amzDate,
      'Host': host,
      'Content-Type': contentType,
    },
    body,
  });
  if (!resp.ok) {
    const respBody = await resp.text().catch(() => '(unable to read body)');
    console.error('  R2 PUT failed: HTTP ' + resp.status + ' ' + resp.statusText);
    console.error('  Response: ' + respBody.slice(0, 500));
    console.error('  Key: ' + key + ', Size: ' + body.length + ' bytes');
  }
  return resp.ok;
}

async function fetchRandomImage() {
  const resp = await fetch('https://api.lolicon.app/setu/v2?num=1&size=original&r18=1');
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.data || data.data.length === 0) return null;
  return data.data[0];
}

async function downloadImage(url) {
  const resp = await fetch(url, {
    headers: { 'Referer': 'https://www.pixiv.net/', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) return null;
  return Buffer.from(await resp.arrayBuffer());
}

function randomDelay() {
  return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
}

async function main() {
  console.log('=== Lolicon R18 爬虫启动 ===');
  console.log('运行时长: 5 分钟');
  console.log('下载间隔: 15-20 秒随机');
  console.log('目标桶: ' + bucketName);
  console.log('');

  // 获取 R2 已有文件
  console.log('获取 R2 文件列表...');
  const allObjects = await listAllObjects();
  const existingKeys = new Set(allObjects.map(o => o.key));
  console.log('R2 中已有 ' + existingKeys.size + ' 个文件');

  // 从 R2 重新生成 images-info.json（自动清理假链接）
  console.log('');
  regenerateImagesJson(allObjects);

  // 开始爬取
  console.log('\n开始爬取新图片...');
  const startTime = Date.now();
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  while (Date.now() - startTime < RUN_DURATION) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((RUN_DURATION - (Date.now() - startTime)) / 1000);
    console.log('[' + elapsed + 's / 300s] 剩余 ' + remaining + 's');

    try {
      const imageInfo = await fetchRandomImage();
      if (!imageInfo) {
        console.log('  获取图片信息失败，跳过');
        failed++;
        await new Promise(r => setTimeout(r, randomDelay()));
        continue;
      }

      const pid = imageInfo.pid;
      const ext = '.' + (imageInfo.ext || 'jpg');
      const filename = pid + ext;

      if (existingKeys.has(filename)) {
        console.log('  ' + filename + ' 已存在，跳过');
        skipped++;
        await new Promise(r => setTimeout(r, randomDelay()));
        continue;
      }

      console.log('  下载 ' + filename + '...');
      const imgUrl = imageInfo.urls.original;
      const imgData = await downloadImage(imgUrl);
      if (!imgData) {
        console.log('  下载失败');
        failed++;
        await new Promise(r => setTimeout(r, randomDelay()));
        continue;
      }

      console.log('  上传到 R2...');
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      const uploaded = await uploadToR2(filename, imgData, contentType);
      if (!uploaded) {
        console.log('  上传失败');
        failed++;
        await new Promise(r => setTimeout(r, randomDelay()));
        continue;
      }

      console.log('  OK ' + filename + ' (' + Math.round(imgData.length / 1024) + 'KB)');
      downloaded++;
      existingKeys.add(filename);
    } catch (e) {
      console.log('  错误: ' + e.message);
      failed++;
    }

    const delay = randomDelay();
    console.log('  等待 ' + Math.round(delay / 1000) + ' 秒...');
    await new Promise(r => setTimeout(r, delay));
  }

  // 爬取结束后再次重新生成 JSON（包含新下载的图片）
  if (downloaded > 0) {
    console.log('\n重新生成 images-info.json...');
    const finalObjects = await listAllObjects();
    regenerateImagesJson(finalObjects);
  }

  console.log('\n========== 爬取完成 ==========');
  console.log('成功下载: ' + downloaded + ' 张');
  console.log('跳过(已存在): ' + skipped + ' 张');
  console.log('失败: ' + failed + ' 张');
}

main();
