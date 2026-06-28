// crawl-lolicon.mjs
// 从 Lolicon API 爬取图片，上传到 R2
// r18=1 的图片放 r18/，r18=0 的图片放 normal/
// 每次运行 5 分钟，每隔 15-20 秒随机下载一张
import crypto from 'crypto';
import { writeFileSync, readFileSync } from 'fs';

const accountId = process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_KEY;
const bucketName = process.env.R2_HOMEPAGE_BUCKET || 'homepage-bg';
const cdnBase = 'https://img-homepage.openserve.cloud';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const RUN_DURATION = 5 * 60 * 1000;
const MIN_DELAY = 15000;
const MAX_DELAY = 20000;

// 爬取模式：r18 和 normal 交替
const MODES = [
  { r18: 1, prefix: 'r18/', label: 'R18' },
  { r18: 0, prefix: 'normal/', label: 'Normal' },
];

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
    if (!resp.ok) {
      console.error('R2 list failed: HTTP ' + resp.status);
      break;
    }
    const xml = await resp.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      const key = m[1];
      const sizeMatch = xml.match(new RegExp('<Size>(\\d+)</Size>'));
      objects.push({ key, size: parseInt(sizeMatch?.[1] || '0') });
    }
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const next = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = next ? next[1] : '';
  }
  return objects;
}

async function uploadToR2(key, body, contentType) {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const { authorization, amzDate } = signRequest('PUT', '/' + key, '', bodyHash, new Date(), { 'content-type': contentType });
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
    console.error('  R2 PUT failed: HTTP ' + resp.status);
    console.error('  Response: ' + respBody.slice(0, 300));
  }
  return resp.ok;
}

async function fetchRandomImage(r18) {
  const resp = await fetch('https://api.lolicon.app/setu/v2?num=1&size=original&r18=' + r18);
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
  console.log('=== Lolicon 爬虫启动 ===');
  console.log('运行时长: 5 分钟');
  console.log('下载间隔: 15-20 秒随机');
  console.log('模式: R18 (r18/) + Normal (normal/) 交替');
  console.log('目标桶: ' + bucketName);
  console.log('');

  // 读取现有元数据缓存
  const metadataCachePath = './metadata-cache.json';
  let metadataCache = {};
  try {
    metadataCache = JSON.parse(readFileSync(metadataCachePath, 'utf8'));
    console.log('已加载元数据缓存: ' + Object.keys(metadataCache).length + ' 条');
  } catch (e) {
    console.log('元数据缓存不存在，将创建新缓存');
  }

  // 获取 R2 已有文件
  console.log('获取 R2 文件列表...');
  const allObjects = await listAllObjects();
  const existingKeys = new Set(allObjects.map(o => o.key));
  console.log('R2 中已有 ' + existingKeys.size + ' 个文件');

  // 开始下载
  console.log('\n开始下载...');
  const startTime = Date.now();
  const pending = []; // 暂存下载的图片，最后统一上传
  let skipped = 0;
  let failed = 0;
  let modeIndex = 0;

  while (Date.now() - startTime < RUN_DURATION) {
    const mode = MODES[modeIndex % MODES.length];
    modeIndex++;

    try {
      const imageInfo = await fetchRandomImage(mode.r18);
      if (!imageInfo) {
        console.log('  [' + mode.label + '] 获取图片信息失败，跳过');
        failed++;
        await new Promise(r => setTimeout(r, randomDelay()));
        continue;
      }

      const pid = imageInfo.pid;
      const ext = '.' + (imageInfo.ext || 'jpg');
      const filename = pid + ext;
      const r2Key = mode.prefix + filename;

      if (existingKeys.has(r2Key)) {
        console.log('  [' + mode.label + '] ' + filename + ' 已存在，跳过');
        skipped++;
        await new Promise(r => setTimeout(r, randomDelay()));
        continue;
      }

      console.log('  [' + mode.label + '] 下载 ' + filename + '...');
      console.log('    标题: ' + (imageInfo.title || '(无标题)') + ' (by ' + (imageInfo.author || '(未知作者)') + ')');
      const imgUrl = imageInfo.urls.original;
      const imgData = await downloadImage(imgUrl);
      if (!imgData) {
        console.log('  [' + mode.label + '] 下载失败');
        failed++;
        await new Promise(r => setTimeout(r, randomDelay()));
        continue;
      }

      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      // 保存元数据
      const metadata = {
        pid: imageInfo.pid,
        p: imageInfo.p || 0,
        uid: imageInfo.uid,
        title: imageInfo.title || '',
        author: imageInfo.author || '',
        width: imageInfo.width || 0,
        height: imageInfo.height || 0,
        tags: imageInfo.tags || [],
        ext: imageInfo.ext || 'jpg',
        r18: imageInfo.r18 || false,
        uploadDate: imageInfo.uploadDate || 0,
      };
      pending.push({ r2Key, filename, imgData, contentType, label: mode.label, metadata });
      console.log('  [' + mode.label + '] 已下载 ' + filename + ' (' + Math.round(imgData.length / 1024) + 'KB)，等待批量上传');
      console.log('    元数据: ' + metadata.title + ' (' + metadata.width + 'x' + metadata.height + ')');
      existingKeys.add(r2Key);
    } catch (e) {
      console.log('  错误: ' + e.message);
      failed++;
    }

    const delay = randomDelay();
    console.log('  等待 ' + Math.round(delay / 1000) + ' 秒...');
    await new Promise(r => setTimeout(r, delay));
  }

  // 批量上传
  let uploaded = { r18: 0, normal: 0 };
  let uploadFailed = 0;

  if (pending.length > 0) {
    console.log('\n========== 开始批量上传 ==========');
    console.log('待上传: ' + pending.length + ' 张');
    console.log('');

    for (const item of pending) {
      process.stdout.write('  上传 ' + item.r2Key + '... ');
      const ok = await uploadToR2(item.r2Key, item.imgData, item.contentType);
      if (ok) {
        console.log('OK');
        uploaded[item.label === 'R18' ? 'r18' : 'normal']++;
        
        // 保存元数据到缓存
        if (item.metadata) {
          metadataCache[item.metadata.pid] = item.metadata;
        }
      } else {
        console.log('FAILED');
        uploadFailed++;
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // 保存元数据缓存到文件
  if (Object.keys(metadataCache).length > 0) {
    writeFileSync(metadataCachePath, JSON.stringify(metadataCache, null, 2), 'utf8');
    console.log('\n✅ 元数据缓存已保存: ' + metadataCachePath);
  }

  console.log('\n========== 爬取完成 ==========');
  console.log('下载: R18 ' + uploaded.r18 + ' 张, Normal ' + uploaded.normal + ' 张');
  console.log('跳过(已存在): ' + skipped + ' 张');
  console.log('下载失败: ' + failed + ' 张');
  console.log('上传失败: ' + uploadFailed + ' 张');
}

main();
