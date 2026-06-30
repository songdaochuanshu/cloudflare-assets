// crawl-lolicon.ts
// 从 Lolicon API 爬取图片，上传到 R2
// r18=1 的图片放 r18/，r18=0 的图片放 normal/
// 每次运行 5 分钟，每隔 15-20 秒随机下载一张
import { writeFileSync, readFileSync } from 'node:fs';
import { bucketName, listAllKeys, uploadToR2 } from '../../r2/r2-client.js';
import type { LoliconResponse, LoliconImage, WorkflowResult } from '../../types/env.js';

interface PendingItem {
  r2Key: string;
  filename: string;
  imgData: Buffer;
  contentType: string;
  label: string;
  metadata: {
    pid: number;
    p: number;
    uid: number;
    title: string;
    author: string;
    width: number;
    height: number;
    tags: string[];
    ext: string;
    r18: boolean;
    uploadDate: number;
  } | null;
}

interface UploadedStats {
  r18: number;
  normal: number;
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const RUN_DURATION = 5 * 60 * 1000;
const MIN_DELAY = 15000;
const MAX_DELAY = 20000;

// 爬取模式：r18 和 normal 交替
const MODES: { r18: 0 | 1 | 2; prefix: string; label: string }[] = [
  { r18: 1, prefix: 'r18/', label: 'R18' },
  { r18: 0, prefix: 'normal/', label: 'Normal' },
];

async function fetchRandomImage(r18: 0 | 1 | 2): Promise<LoliconImage | null> {
  const resp = await fetch('https://api.lolicon.app/setu/v2?num=1&size=original&r18=' + r18);
  if (!resp.ok) return null;
  const data = (await resp.json()) as LoliconResponse;
  if (!data.data || data.data.length === 0) return null;
  return data.data[0] ?? null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  const resp = await fetch(url, {
    headers: { 'Referer': 'https://www.pixiv.net/', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) return null;
  return Buffer.from(await resp.arrayBuffer());
}

function randomDelay(): number {
  return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
}

async function main(): Promise<void> {
  console.log('=== Lolicon 爬虫启动 ===');
  console.log('运行时长: 5 分钟');
  console.log('下载间隔: 15-20 秒随机');
  console.log('模式: R18 (r18/) + Normal (normal/) 交替');
  console.log('目标桶: ' + bucketName);
  console.log('');

  // 读取现有元数据缓存
  const metadataCachePath = './metadata-cache.json';
  let metadataCache: Record<string, unknown> = {};
  try {
    metadataCache = JSON.parse(readFileSync(metadataCachePath, 'utf8'));
    console.log('已加载元数据缓存: ' + Object.keys(metadataCache).length + ' 条');
  } catch {
    console.log('元数据缓存不存在，将创建新缓存');
  }

  // 获取 R2 已有文件
  console.log('获取 R2 文件列表...');
  const allKeys = await listAllKeys();
  const existingKeys = new Set<string>(allKeys);
  console.log('R2 中已有 ' + existingKeys.size + ' 个文件');

  // 开始下载
  console.log('\n开始下载...');
  const startTime = Date.now();
  const pending: PendingItem[] = []; // 暂存下载的图片，最后统一上传
  let skipped = 0;
  let failed = 0;
  let modeIndex = 0;

  while (Date.now() - startTime < RUN_DURATION) {
    const mode = MODES[modeIndex % MODES.length];
    if (!mode) break;
    modeIndex++;

    try {
      const imageInfo = await fetchRandomImage(mode.r18);
      if (!imageInfo) {
        console.log('  [' + mode.label + '] 获取图片信息失败，跳过');
        failed++;
        await new Promise<void>(r => setTimeout(r, randomDelay()));
        continue;
      }

      const pid = imageInfo.pid;
      const ext = '.' + (imageInfo.ext || 'jpg');
      const filename = pid + ext;
      const r2Key = mode.prefix + filename;

      if (existingKeys.has(r2Key)) {
        console.log('  [' + mode.label + '] ' + filename + ' 已存在，跳过');
        skipped++;
        await new Promise<void>(r => setTimeout(r, randomDelay()));
        continue;
      }

      console.log('  [' + mode.label + '] 下载 ' + filename + '...');
      console.log('    标题: ' + (imageInfo.title || '(无标题)') + ' (by ' + (imageInfo.author || '(未知作者)') + ')');
      const imgUrl = imageInfo.urls.original;
      const imgData = await downloadImage(imgUrl);
      if (!imgData) {
        console.log('  [' + mode.label + '] 下载失败');
        failed++;
        await new Promise<void>(r => setTimeout(r, randomDelay()));
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('  错误: ' + msg);
      failed++;
    }

    const delay = randomDelay();
    console.log('  等待 ' + Math.round(delay / 1000) + ' 秒...');
    await new Promise<void>(r => setTimeout(r, delay));
  }

  // 批量上传
  const uploaded: UploadedStats = { r18: 0, normal: 0 };
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
          (metadataCache as Record<string, PendingItem['metadata']>)[item.metadata.pid] = item.metadata;
        }
      } else {
        console.log('FAILED');
        uploadFailed++;
      }
      await new Promise<void>(r => setTimeout(r, 100));
    }
  }

  // 保存元数据缓存到文件
  if (Object.keys(metadataCache).length > 0) {
    writeFileSync(metadataCachePath, JSON.stringify(metadataCache, null, 2), 'utf8');
    console.log('\n✅ 元数据缓存已保存: ' + metadataCachePath);
  }

  // 生成工作流结果（标准格式）
  const workflowResult: WorkflowResult = {
    workflow: 'crawl-lolicon',
    success: failed === 0 && uploadFailed === 0,
    timestamp: new Date().toISOString(),
    duration: Math.round((Date.now() - startTime) / 1000) + '秒',
    stats: {
      downloaded: { r18: uploaded.r18, normal: uploaded.normal, total: uploaded.r18 + uploaded.normal },
      skipped: skipped,
      failed: { download: failed, upload: uploadFailed, total: failed + uploadFailed },
    },
    details: pending.map(item => ({
      filename: item.filename,
      r2Key: item.r2Key,
      label: item.label,
      size: Math.round(item.imgData.length / 1024) + 'KB',
      metadata: item.metadata ? {
        title: item.metadata.title,
        author: item.metadata.author,
        width: item.metadata.width,
        height: item.metadata.height,
        tags: item.metadata.tags.slice(0, 5),
      } : null,
    })),
  };

  // 同时保存为 crawl-summary.json（向后兼容）和 workflow-result.json（标准格式）
  const summary = workflowResult; // 保持变量名兼容

  // 写入结果文件（供通用邮件通知组件读取）
  writeFileSync('crawl-summary.json', JSON.stringify(summary, null, 2), 'utf8');
  writeFileSync('workflow-result.json', JSON.stringify(workflowResult, null, 2), 'utf8');
  console.log('\n✅ 爬取结果已保存:');
  console.log('   - crawl-summary.json（向后兼容）');
  console.log('   - workflow-result.json（标准格式，供邮件通知组件读取）');

  console.log('\n========== 爬取完成 ==========');
  console.log('下载: R18 ' + uploaded.r18 + ' 张, Normal ' + uploaded.normal + ' 张');
  console.log('跳过(已存在): ' + skipped + ' 张');
  console.log('下载失败: ' + failed + ' 张');
  console.log('上传失败: ' + uploadFailed + ' 张');
  console.log('\n详细结果已保存到 crawl-summary.json');
}

main();
