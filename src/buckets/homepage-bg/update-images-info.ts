// update-images-info.ts
// 从 R2 homepage-bg 桶列出所有图片，生成/覆盖 images-info.json，并上传到 R2
import { readFileSync, writeFileSync } from 'node:fs';
import { host, bucketName, cdnBase, listAllKeys, uploadToR2 } from '../../r2/r2-client.js';
import type { ImageEntry, ImagesInfo } from '../../types/env.js';

const customDomain = cdnBase;

async function main(): Promise<void> {
  console.log('=== R2 图片链接更新工具 ===');
  console.log('Bucket: ' + bucketName);
  console.log('');

  // 读取元数据缓存
  let metadataCache: Record<string, Partial<ImageEntry>> = {};
  try {
    metadataCache = JSON.parse(readFileSync('./metadata-cache.json', 'utf8'));
    console.log('已加载元数据缓存: ' + Object.keys(metadataCache).length + ' 条');
  } catch {
    console.log('⚠️  元数据缓存不存在，将使用空元数据');
  }

  console.log('获取 R2 文件列表...');
  const allKeys = await listAllKeys();
  console.log('R2 中总文件数: ' + allKeys.length);

  // 构建 images-info.json（按 r18/normal 分类）
  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const makeEntry = (key: string): ImageEntry => {
    const filename = key.split('/').pop() ?? '';
    const pid = parseInt(filename.replace(/\.[^.]+$/, ''));
    const ext = filename.split('.').pop() ?? '';

    // 尝试从缓存读取元数据
    const cached = metadataCache[pid] ?? {};

    return {
      pid,
      filename,
      url: customDomain + '/' + key,
      title: cached.title ?? '',
      author: cached.author ?? '',
      width: cached.width ?? 0,
      height: cached.height ?? 0,
      tags: cached.tags ?? [],
      ext: cached.ext ?? ext,
      size_kb: 0,
      downloaded: true,
    };
  };

  const r18Images = allKeys
    .filter((key: string) => key.startsWith('r18/') && IMAGE_EXTENSIONS.includes('.' + (key.split('.').pop() ?? '').toLowerCase()))
    .map(makeEntry)
    .sort((a, b) => a.pid - b.pid);

  const normalImages = allKeys
    .filter((key: string) => key.startsWith('normal/') && IMAGE_EXTENSIONS.includes('.' + (key.split('.').pop() ?? '').toLowerCase()))
    .map(makeEntry)
    .sort((a, b) => a.pid - b.pid);

  const imagesInfo: ImagesInfo = { r18: r18Images, normal: normalImages };

  // 写入 JSON
  const jsonContent = JSON.stringify(imagesInfo, null, 2);
  writeFileSync('images-info.json', jsonContent, 'utf8');
  console.log('已写入 images-info.json (r18: ' + r18Images.length + ' 条, normal: ' + normalImages.length + ' 条)');

  // 上传 images-info.json 到 R2
  console.log('\n上传 images-info.json 到 R2...');
  const ok = await uploadToR2('images-info.json', jsonContent, 'application/json');
  if (ok) {
    console.log('✅ images-info.json 已上传到 R2');
  } else {
    console.log('❌ 上传失败');
  }

  // 打印前 5 条作为示例
  console.log('\n前 5 条示例 (r18):');
  (imagesInfo.r18 || []).slice(0, 5).forEach((img: ImageEntry) => {
    console.log(`  PID: ${img.pid}, File: ${img.filename}, URL: ${img.url}`);
  });

  console.log('\n前 5 条示例 (normal):');
  (imagesInfo.normal || []).slice(0, 5).forEach((img: ImageEntry) => {
    console.log(`  PID: ${img.pid}, File: ${img.filename}, URL: ${img.url}`);
  });
}

main();
