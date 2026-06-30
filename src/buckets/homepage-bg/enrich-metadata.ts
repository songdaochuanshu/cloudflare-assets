// enrich-metadata.ts
// 补全 images-info.json 中的图片元数据（title, author, width, height, tags）
// 通过 Pixiv oEmbed API 获取（无需登录）
import { readFileSync, writeFileSync } from 'node:fs';
import type { ImageEntry, ImagesInfo, PixivOEmbed } from '../../types/env.js';

const IMAGES_INFO_PATH = './images-info.json';
const BATCH_SIZE = 10; // 每批处理 10 张
const DELAY_MS = 1000; // 每次请求间隔 1 秒（避免被限流）

// 从 Pixiv oEmbed API 获取图片信息（无需登录）
async function fetchPixivMetadata(pid: number): Promise<{ title: string; author: string; width: number; height: number; tags: string[] } | null> {
  try {
    const url = `https://www.pixiv.net/oembed?url=https://www.pixiv.net/artworks/${pid}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!resp.ok) {
      console.log(`  ❌ PID ${pid}: HTTP ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as PixivOEmbed;

    // oEmbed 返回的数据格式：
    // {
    //   "type": "photo",
    //   "title": "作品标题",
    //   "author_name": "作者名",
    //   "author_url": "https://www.pixiv.net/users/...",
    //   "width": 1200,
    //   "height": 800,
    //   "url": "https://i.pixiv.re/...",
    //   "html": "..."
    // }

    return {
      title: data.title ?? '',
      author: data.author_name ?? '',
      width: data.width ?? 0,
      height: data.height ?? 0,
      tags: [], // oEmbed 不返回 tags，需要单独获取
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ PID ${pid}: ${msg}`);
    return null;
  }
}

// 延迟函数
function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('=== 图片元数据补全工具 ===');
  console.log('');

  // 读取现有数据
  console.log('读取 images-info.json...');
  const rawData: unknown = JSON.parse(readFileSync(IMAGES_INFO_PATH, 'utf8'));

  // 兼容新旧格式
  let allImages: ImageEntry[] = [];
  if (Array.isArray(rawData)) {
    allImages = rawData as ImageEntry[];
  } else if (typeof rawData === 'object' && rawData !== null && 'r18' in rawData && 'normal' in rawData) {
    const classified = rawData as ImagesInfo;
    allImages = [...classified.r18, ...classified.normal];
  }

  console.log(`总图片数: ${allImages.length}`);

  // 统计需要补全的图片
  const needEnrich = allImages.filter(
    (img: ImageEntry) => !img.title || !img.author || !img.width || !img.height
  );
  console.log(`需要补全元数据: ${needEnrich.length} 张`);
  console.log('');

  if (needEnrich.length === 0) {
    console.log('✅ 所有图片已有完整元数据，无需补全');
    return;
  }

  // 逐批处理
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < needEnrich.length; i += BATCH_SIZE) {
    const batch = needEnrich.slice(i, i + BATCH_SIZE);
    console.log(`\n处理第 ${Math.floor(i / BATCH_SIZE) + 1} 批 (${batch.length} 张)...`);

    for (const img of batch) {
      console.log(`  PID: ${img.pid}...`);
      const metadata = await fetchPixivMetadata(img.pid);

      if (metadata) {
        // 更新元数据
        img.title = metadata.title;
        img.author = metadata.author;
        img.width = metadata.width;
        img.height = metadata.height;
        // tags 暂时留空（oEmbed 不返回）
        successCount++;
        console.log(`    ✅ ${metadata.title} (by ${metadata.author})`);
      } else {
        failCount++;
        console.log(`    ❌ 获取失败`);
      }

      // 延迟，避免被限流
      await sleep(DELAY_MS);
    }
  }

  console.log('\n========== 补全完成 ==========');
  console.log(`成功: ${successCount} 张`);
  console.log(`失败: ${failCount} 张`);
  console.log('');

  // 写回文件
  console.log('写入 images-info.json...');
  let outputData: ImageEntry[] | ImagesInfo;
  if (Array.isArray(rawData)) {
    outputData = allImages;
  } else {
    outputData = {
      r18: allImages.filter((img: ImageEntry) => img.url.includes('/r18/')),
      normal: allImages.filter((img: ImageEntry) => img.url.includes('/normal/')),
    };
  }

  writeFileSync(IMAGES_INFO_PATH, JSON.stringify(outputData, null, 2), 'utf8');
  console.log('✅ 已更新 images-info.json');
  console.log('');
  console.log('⚠️  请手动运行 update-images-info.ts 上传到 R2');
}

main();
