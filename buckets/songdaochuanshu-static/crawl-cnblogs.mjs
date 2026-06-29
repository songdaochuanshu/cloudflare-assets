// buckets/songdaochuanshu-static/crawl-cnblogs.mjs
// 爬取博客园首页推荐文章，去重后上传到 R2 songdaochuanshu-static 桶

import https from 'https';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

// R2 配置
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

const CNBLOGS_HOME = 'https://www.cnblogs.com/';

// 获取 HTML
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 从 HTML 提取文章链接
function extractArticleLinks(html) {
  const pattern = /href="(https?:\/\/www\.cnblogs\.com\/[^\/]+\/p\/\d+)"/g;
  const matches = new Set();
  let match;
  while ((match = pattern.exec(html)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches);
}

// 从文章页提取标题和内容
async function fetchArticle(url) {
  const html = await fetchHtml(url);
  
  // 提取标题（清理后缀）
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let title = titleMatch ? titleMatch[1].trim() : '无标题';
  // 去掉 " - 博客园" 或 " - 用户名 - 博客园"
  title = title.replace(/\s*-\s*[^-\s]+\s*-\s*博客园$/, '').replace(/\s*-\s*博客园$/, '').trim();
  
  // 提取文章内容（HTML）
  const bodyMatch = html.match(/<div id="cnblogs_post_body"[^>]*>([\s\S]*?)<\/div>/i);
  const contentHtml = bodyMatch ? bodyMatch[1] : '<p>内容获取失败</p>';
  
  // 转 Markdown（简单处理）
  const markdown = `# ${title}\n\n> 原文：[${title}](${url})\n> 来源：博客园推荐文章\n> 爬取时间：${new Date().toISOString()}\n\n${contentHtml}`;
  
  return { title, markdown, url };
}

// 从 R2 获取现有文章标题（用于去重）
async function getExistingTitles() {
  const command = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/' });
  const response = await s3.send(command);
  const titles = new Set();
  for (const obj of response.Contents || []) {
    if (obj.Key.endsWith('.md')) {
      // 读取文件内容，提取标题
      try {
        const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
        const { Body } = await s3.send(getCmd);
        const content = await Body.transformToString();
        const titleMatch = content.match(/^# (.+)$/m);
        if (titleMatch) titles.add(titleMatch[1].trim());
      } catch (e) {
        // 忽略读取错误
      }
    }
  }
  return titles;
}

// 上传到 R2
async function uploadToR2(title, content) {
  const filename = `blog/cnblogs-${Date.now()}.md`;
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filename,
    Body: content,
    ContentType: 'text/markdown; charset=utf-8',
  });
  await s3.send(command);
  return filename;
}

// 主函数
async function main() {
  console.log('[crawl-cnblogs] 开始...');
  
  // 1. 获取首页 HTML
  const html = await fetchHtml(CNBLOGS_HOME);
  console.log(`[crawl-cnblogs] 首页 HTML 长度：${html.length}`);
  
  // 2. 提取文章链接
  const links = extractArticleLinks(html);
  console.log(`[crawl-cnblogs] 找到 ${links.length} 篇文章`);
  
  if (links.length === 0) {
    console.log('[crawl-cnblogs] 未找到文章');
    return;
  }
  
  // 3. 获取现有文章标题（去重）
  const existingTitles = await getExistingTitles();
  console.log(`[crawl-cnblogs] R2 已有 ${existingTitles.size} 篇文章`);
  
  // 4. 找一篇不重复的文章
  let targetUrl = null;
  for (const url of links) {
    const { title } = await fetchArticle(url);
    if (!existingTitles.has(title)) {
      targetUrl = url;
      console.log(`[crawl-cnblogs] 找到新文章：《${title}》`);
      break;
    } else {
      console.log(`[crawl-cnblogs] 跳过（已存在）：《${title}》`);
    }
  }
  
  if (!targetUrl) {
    console.log('[crawl-cnblogs] 所有文章都已存在，无需上传');
    return;
  }
  
  // 5. 获取内容并上传
  const { title, markdown } = await fetchArticle(targetUrl);
  const key = await uploadToR2(title, markdown);
  console.log(`[crawl-cnblogs] ✅ 上传成功：${key}`);
  
  // 6. 更新 manifest.json
  await updateManifest();
  console.log('[crawl-cnblogs] ✅ manifest.json 已更新');
}

main().catch(err => {
  console.error('[crawl-cnblogs] 错误：', err.message);
  process.exit(1);
}

// 更新 manifest.json
async function updateManifest() {
  console.log('[crawl-cnblogs] 开始更新 manifest.json...');
  
  // 1. 获取所有文章
  const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/', MaxKeys: 1000 });
  const response = await s3.send(listCmd);
  
  const posts = [];
  for (const obj of response.Contents || []) {
    if (!obj.Key.endsWith('.md')) continue;
    
    // 读取文章标题
    try {
      const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
      const { Body } = await s3.send(getCmd);
      const content = await Body.transformToString();
      
      const titleMatch = content.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : obj.Key;
      
      // 获取文章日期（从文件名或内容）
      const dateMatch = obj.Key.match(/cnblogs-(\d+)/);
      const date = dateMatch ? new Date(parseInt(dateMatch[1])).toISOString() : new Date().toISOString();
      
      posts.push({
        path: `/p/${obj.Key}`,
        key: obj.Key,
        category: 'blog',
        title: title,
        date: date,
        description: '',
        tags: [],
        layout: 'post'
      });
    } catch (e) {
      console.error(`[crawl-cnblogs] 读取 ${obj.Key} 失败：`, e.message);
    }
  }
  
  // 2. 生成 manifest.json（兼容现有格式）
  const manifest = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    total: posts.length,
    posts: posts.sort((a, b) => new Date(b.date) - new Date(a.date))
  };
  
  const manifestContent = JSON.stringify(manifest, null, 2);
  
  // 3. 上传到 R2
  const putCmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: 'manifest.json',
    Body: manifestContent,
    ContentType: 'application/json; charset=utf-8',
  });
  await s3.send(putCmd);
  console.log(`[crawl-cnblogs] manifest.json 已更新（${posts.length} 篇文章）`);
});
