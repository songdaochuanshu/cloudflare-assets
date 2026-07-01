// delete-all-posts.ts
// 删除所有文章
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { writeWorkflowResult, elapsed } from '../../lib/workflow-result.js';
import { logger } from '../../lib/logger.js';

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

async function deleteAllPosts(): Promise<void> {
  const startTime = Date.now();
  logger.info('[delete-all-posts] 开始删除所有文章...\n');

  // 列出所有 blog/ 开头的文件
  const listCommand = new ListObjectsV2Command({
    Bucket: R2_BUCKET,
    Prefix: 'blog/',
  });
  const listResult = await s3.send(listCommand);

  if (!listResult.Contents || listResult.Contents.length === 0) {
    logger.info('没有找到任何文章');
    writeWorkflowResult({
      success: true,
      workflow: 'delete-all-posts',
      timestamp: new Date().toISOString(),
      duration: elapsed(startTime),
      stats: { deleted: 0, total: 0 },
      details: [],
    });
    return;
  }

  const total = listResult.Contents.length;
  logger.info(`找到 ${total} 篇文章:\n`);

  const details: Array<Record<string, unknown>> = [];
  for (const obj of listResult.Contents) {
    const key = obj.Key;
    if (!key) continue;
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    await s3.send(deleteCommand);
    details.push({ key, status: '已删除' });
    logger.info(`🗑️ 已删除: ${key}`);
  }

  logger.info('\n✅ 删除完成！');

  writeWorkflowResult({
    success: true,
    workflow: 'delete-all-posts',
    timestamp: new Date().toISOString(),
    duration: elapsed(startTime),
    stats: { deleted: total, total },
    details,
  });
}

deleteAllPosts().catch((err: Error) => {
  writeWorkflowResult({
    success: false,
    workflow: 'delete-all-posts',
    timestamp: new Date().toISOString(),
    stats: {},
    details: [],
    error: err.message,
  });
  logger.error(err);
  process.exit(1);
});
