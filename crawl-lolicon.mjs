// crawl-lolicon.mjs
// 从 Lolicon API 爬取 R18 图片，上传到 R2
// 每次运行 5 分钟，每隔 15-20 秒随机下载一张
import crypto from 'crypto';
import { writeFileSync } from 'fs';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_IMAGES_BUCKET || 'homepage-bg';
const cdnBase = 'https://img-homepage.openserve.cloud';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';

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
    if (!resp.ok) break;
    const xml = await resp.text();
    const matches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
    for (const m of matches) keys.push(m[1]);
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const nextMarkerMatch = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = nextMarkerMatch ? nextMarkerMatch[1] : '';
  }
  return keys;
}

async function uploadToR2(key, body, contentType) {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const { authorization, amzDate } = signRequest('PUT', '/' + key, '', bodyHash, new Date());
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
  return resp.ok;
}

// Lolicon API - r18=1 获取 R18 图片
async function fetchRandomImage() {
  const resp = await fetch('https://api.lolicon.app/setu/v2?num=1&size=original&r18=1');
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.data || data.data.length === 0) return null;
  return data.data[0];
}

async function downloadImage(url) {
  const resp = await fetch(url, {
    headers: {
      'Referer': 'https://www.pixiv.net/',
      'User-Agent': 'Mozilla/5.0',
    },
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

  console.log('获取 R2 已有文件...');
  const existingKeys = new Set(await listAllKeys());
  console.log('已有 ' + existingKeys.size + ' 个文件');

  const startTime = Date.now();
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const newImages = [];

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
      newImages.push({
        pid,
        filename,
        url: cdnBase + '/' + filename,
        title: imageInfo.title || '',
        author: imageInfo.author || '',
        width: imageInfo.width || 0,
        height: imageInfo.height || 0,
        tags: imageInfo.tags || [],
        ext: ext.slice(1),
        size_kb: Math.round(imgData.length / 1024),
        downloaded: true,
      });
    } catch (e) {
      console.log('  错误: ' + e.message);
      failed++;
    }

    const delay = randomDelay();
    console.log('  等待 ' + Math.round(delay / 1000) + ' 秒...');
    await new Promise(r => setTimeout(r, delay));
  }

  console.log('\n========== 爬取完成 ==========');
  console.log('成功下载: ' + downloaded + ' 张');
  console.log('跳过(已存在): ' + skipped + ' 张');
  console.log('失败: ' + failed + ' 张');
  console.log('新增图片信息: ' + newImages.length + ' 条');

  if (newImages.length > 0) {
    writeFileSync('new-images.json', JSON.stringify(newImages, null, 2));
    console.log('新增图片信息已保存到 new-images.json');
  }
}

main();
