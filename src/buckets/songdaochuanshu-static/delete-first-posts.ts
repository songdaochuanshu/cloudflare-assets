// delete-first-posts.ts
// 删除前 N 篇文章（用于清理测试文章）
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const R2_ENDPOINT = `https://${process.env.CF_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`;
const R2_BUCKET = process.env.R2_BLOG_BUCKET ?? 'songdaochuanshu-static';

const s3 = new S3Client({
  endpoint: R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_KEY ?? '',
  },
});

// 要删除的文章（按上传顺序，最早的在前）
const POSTS_TO_DELETE: string[] = [
  'blog/2026-06-29-cloudflare-workers-实战教程-我的云函数之旅.md',
  'blog/2026-06-29-rust-语言入门指南-我的-rust-之旅.md',
  'blog/2026-06-29-开源项目维护心得-我与项目的那些年.md',
];

async function deletePost(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  await s3.send(command);
  console.log(`🗑️ 已删除: ${key}`);
}

async function main(): Promise<void> {
  console.log('[delete-first-posts] 开始删除前 3 篇文章...\n');

  for (const key of POSTS_TO_DELETE) {
    try {
      await deletePost(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ 删除失败 ${key}: ${msg}`);
    }
  }

  console.log('\n✅ 删除完成！请运行 crawl-cnblogs.mjs --fix-manifest 更新 manifest.json');
}

main().catch((err: Error) => console.error(err));
