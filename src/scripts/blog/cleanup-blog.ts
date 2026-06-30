// cleanup-blog.ts
// 清空 R2 桶中所有 blog/ 开头的文件
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const R2_ENDPOINT = `https://${process.env.CF_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`;
const BUCKET = process.env.R2_BLOG_BUCKET ?? 'songdaochuanshu-static';

const s3 = new S3Client({
  endpoint: R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_KEY ?? '',
  },
});

async function main(): Promise<void> {
  console.log('[cleanup-blog] 开始清空 blog/ 前缀的文件...');

  // 1. 列出所有 blog/ 开头的文件
  const listCommand = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: 'blog/',
  });

  const { Contents } = await s3.send(listCommand);

  if (!Contents || Contents.length === 0) {
    console.log('[cleanup-blog] 没有找到文件，无需删除');
  } else {
    console.log(`[cleanup-blog] 找到 ${Contents.length} 个文件，开始删除...`);

    // 2. 逐个删除
    let deleted = 0;
    for (const obj of Contents) {
      if (!obj.Key) continue;
      const deleteCommand = new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: obj.Key,
      });

      await s3.send(deleteCommand);
      deleted++;
      console.log(`[cleanup-blog] 已删除 (${deleted}/${Contents.length}): ${obj.Key}`);
    }

    console.log(`[cleanup-blog] ✅ 共删除 ${deleted} 个文件`);
  }

  // 3. 清空 manifest.json
  console.log('[cleanup-blog] 更新 manifest.json（清空 posts 列表）...');
  const emptyManifest = JSON.stringify({ posts: [] }, null, 2);

  const putCommand = new PutObjectCommand({
    Bucket: BUCKET,
    Key: 'manifest.json',
    Body: emptyManifest,
    ContentType: 'application/json; charset=utf-8',
  });

  await s3.send(putCommand);
  console.log('[cleanup-blog] ✅ manifest.json 已清空');
}

main().catch((err: Error) => {
  console.error('[cleanup-blog] 错误：', err.message);
  process.exit(1);
});
