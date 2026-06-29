// buckets/songdaochuanshu-static/delete-all-posts.mjs
// 删除所有文章

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const R2_ENDPOINT = `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_BUCKET = process.env.R2_BLOG_BUCKET || 'songdaochuanshu-static';

const s3 = new S3Client({
  endpoint: R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

async function deleteAllPosts() {
  console.log('[delete-all-posts] 开始删除所有文章...\n');
  
  // 列出所有 blog/ 开头的文件
  const listCommand = new ListObjectsV2Command({
    Bucket: R2_BUCKET,
    Prefix: 'blog/',
  });
  const listResult = await s3.send(listCommand);
  
  if (!listResult.Contents || listResult.Contents.length === 0) {
    console.log('没有找到任何文章');
    return;
  }
  
  console.log(`找到 ${listResult.Contents.length} 篇文章:\n`);
  
  for (const obj of listResult.Contents) {
    const key = obj.Key;
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    await s3.send(deleteCommand);
    console.log(`🗑️ 已删除: ${key}`);
  }
  
  console.log('\n✅ 删除完成！');
}

deleteAllPosts().catch(console.error);
