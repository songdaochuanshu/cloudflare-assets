// delete-old-posts.ts
// 删除旧文章，只保留最新的一篇
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { writeWorkflowResult, elapsed } from '../../lib/workflow-result.js';

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

const KEEP = 'blog/2026-06-29-github-actions-ci-cd-最佳实践-我的十年经验分享.md';

async function deleteOldPosts(): Promise<void> {
  const startTime = Date.now();

  // 列出所有 blog/ 开头的对象
  const listRes = await s3.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: 'blog/',
    }),
  );

  const toDelete = (listRes.Contents ?? []).filter((obj) => obj.Key !== KEEP);

  console.log(`[delete] 找到 ${toDelete.length} 篇旧文章待删除`);

  const details: Array<Record<string, unknown>> = [];
  for (const obj of toDelete) {
    if (!obj.Key) continue;
    console.log(`[delete] 删除: ${obj.Key}`);
    await s3.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: obj.Key,
      }),
    );
    details.push({ key: obj.Key, status: '已删除' });
    console.log(`[delete] ✅ 已删除: ${obj.Key}`);
  }

  console.log('[delete] ✅ 清理完成，保留: ' + KEEP);

  writeWorkflowResult({
    success: true,
    workflow: 'delete-old-posts',
    timestamp: new Date().toISOString(),
    duration: elapsed(startTime),
    stats: { deleted: toDelete.length, kept: 1 },
    details,
  });
}

deleteOldPosts().catch((err: Error) => {
  writeWorkflowResult({
    success: false,
    workflow: 'delete-old-posts',
    timestamp: new Date().toISOString(),
    stats: {},
    details: [],
    error: err.message,
  });
  console.error('[delete] 错误:', err.message);
  process.exit(1);
});
