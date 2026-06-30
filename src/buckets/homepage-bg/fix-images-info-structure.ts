// fix-images-info-structure.ts
// 将 images-info.json 从扁平数组转换为分类结构 { r18: [...], normal: [...] }
import { readFileSync, writeFileSync } from 'node:fs';
import type { ImageEntry, ImagesInfo } from '../../types/env.js';

const INPUT_PATH = './images-info.json';
const OUTPUT_PATH = './images-info.json';

console.log('=== 修复 images-info.json 结构 ===');
console.log('');

// 读取现有数据（兼容旧扁平数组 / 新分类结构）
const rawData: unknown = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));

// 类型守卫
function isImagesInfo(data: unknown): data is ImagesInfo {
  return typeof data === 'object' && data !== null && 'r18' in data && 'normal' in data;
}

// 检查是否已经是分类结构
if (isImagesInfo(rawData)) {
  console.log('✅ 已经是分类结构，无需修复');
  console.log(`   R18: ${rawData.r18.length} 张`);
  console.log(`   Normal: ${rawData.normal.length} 张`);
  process.exit(0);
}

// 假设是扁平数组，需要分类
if (!Array.isArray(rawData)) {
  console.error('❌ 无法识别的数据结构');
  process.exit(1);
}

const rawArray = rawData as ImageEntry[];
console.log(`读取到 ${rawArray.length} 张图片（扁平数组）`);
console.log('');

// 分类逻辑：根据 URL 中的前缀分类
const r18Images: ImageEntry[] = [];
const normalImages: ImageEntry[] = [];

for (const img of rawArray) {
  if (img.url.includes('/r18/')) {
    r18Images.push(img);
  } else if (img.url.includes('/normal/')) {
    normalImages.push(img);
  } else {
    // 旧数据（根目录），归为 normal
    console.log(`  警告: ${img.filename} 不在 r18/ 或 normal/ 前缀下，归为 normal`);
    normalImages.push(img);
  }
}

console.log(`分类结果:`);
console.log(`  R18: ${r18Images.length} 张`);
console.log(`  Normal: ${normalImages.length} 张`);
console.log('');

// 按 PID 排序
r18Images.sort((a, b) => a.pid - b.pid);
normalImages.sort((a, b) => a.pid - b.pid);

// 构建分类结构
const imagesInfo: ImagesInfo = {
  r18: r18Images,
  normal: normalImages,
};

// 写入文件
writeFileSync(OUTPUT_PATH, JSON.stringify(imagesInfo, null, 2), 'utf8');
console.log(`✅ 已修复并写入 ${OUTPUT_PATH}`);
console.log('');
console.log('下一步: 提交并推送到 GitHub，然后手动运行 GitHub Actions "Update Images Info" workflow');
