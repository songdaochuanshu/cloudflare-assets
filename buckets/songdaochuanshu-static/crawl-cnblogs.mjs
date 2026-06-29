// buckets/songdaochuanshu-static/crawl-cnblogs.mjs
// 爬取博客园首页推荐文章，去重后上传到 R2 songdaochuanshu-static 桶

import https from 'https';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

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

// 从文章页提取标题、内容和原始发布日期
async function fetchArticle(url) {
  const html = await fetchHtml(url);
  
  // 提取标题（清理后缀）
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let title = titleMatch ? titleMatch[1].trim() : '无标题';
  // 去掉 " - 博客园" 或 " - 用户名 - 博客园"
  title = title.replace(/\s*-\s*[^-\s]+\s*-\s*博客园$/, '').replace(/\s*-\s*博客园$/, '').trim();
  
  // 提取文章原始发布日期（博客园页面有多个可能位置）
  let publishDate = '';
  // 方式1: <span id="post-date">2024-01-01 12:00</span>
  const dateSpanMatch = html.match(/<span id="post-date"[^>]*>([^<]+)<\/span>/i);
  if (dateSpanMatch) {
    publishDate = dateSpanMatch[1].trim();
  }
  // 方式2: publishDate: '2024-01-01T12:00:00'
  if (!publishDate) {
    const pdMatch = html.match(/publishDate:\s*['"]([^'"]+)['"]/i);
    if (pdMatch) publishDate = pdMatch[1].trim();
  }
  // 方式3: 页面 meta 标签
  if (!publishDate) {
    const metaMatch = html.match(/<meta\s+property="article:published_time"\s+content="([^"]+)"/i);
    if (metaMatch) publishDate = metaMatch[1].trim();
  }
  // 默认：使用爬取时间
  if (!publishDate) {
    publishDate = new Date().toISOString();
  } else {
    // 标准化日期格式为 ISO 8601
    try {
      publishDate = new Date(publishDate).toISOString();
    } catch(e) {
      publishDate = new Date().toISOString();
    }
  }
  
  // 提取文章内容（HTML）
  const bodyMatch = html.match(/<div id="cnblogs_post_body"[^>]*>([\s\S]*?)<\/div>/i);
  const contentHtml = bodyMatch ? bodyMatch[1] : '<p>内容获取失败</p>';
  
  // 生成 Markdown（带 YAML frontmatter 存储标题和原始日期）
  const markdown = `---
title: ${title}
publishDate: ${publishDate}
source: ${url}
---

# ${title}

> 原文：[${title}](${url})
> 来源：博客园推荐文章
> 发布时间：${publishDate}

${contentHtml}`;
  
  return { title, markdown, url, publishDate };
}

// 从 R2 获取现有文章标题（用于去重）
async function getExistingTitles() {
  const command = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/' });
  const response = await s3.send(command);
  const titles = new Set();
  for (const obj of response.Contents || []) {
    if (obj.Key.endsWith('.md')) {
      try {
        const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
        const { Body } = await s3.send(getCmd);
        const content = await Body.transformToString();
        // 从 frontmatter 提取标题
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        if (titleMatch) titles.add(titleMatch[1].trim());
      } catch (e) {
        // 忽略读取错误
      }
    }
  }
  return titles;
}

// 上传到 R2（文件名使用时间戳确保唯一）
async function uploadToR2(title, content, publishDate) {
  // 使用发布日期的时间戳（如果可用），否则使用当前时间
  let timestamp;
  try {
    timestamp = new Date(publishDate).getTime();
  } catch(e) {
    timestamp = Date.now();
  }
  const filename = `blog/cnblogs-${timestamp}.md`;
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filename,
    Body: content,
    ContentType: 'text/markdown; charset=utf-8',
  });
  await s3.send(command);
  return filename;
}

// 更新 manifest.json（从 frontmatter 读取标题和日期）
async function updateManifest() {
  console.log('[crawl-cnblogs] 开始更新 manifest.json...');
  
  // 1. 获取所有文章
  const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/', MaxKeys: 1000 });
  const response = await s3.send(listCmd);
  
  const posts = [];
  for (const obj of response.Contents || []) {
    if (!obj.Key.endsWith('.md')) continue;
    
    // 2. 获取文件元数据（LastModified）
    let lastModified = new Date();
    try {
      const headCmd = new HeadObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
      const headData = await s3.send(headCmd);
      lastModified = headData.LastModified || new Date();
    } catch (e) {
      console.error(`[crawl-cnblogs] 获取 ${obj.Key} 元数据失败：`, e.message);
    }
    
    // 3. 读取文章标题和日期（从 frontmatter 或内容）
    try {
      const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
      const { Body } = await s3.send(getCmd);
      const content = await Body.transformToString();
      
      let title = '未知标题';
      let date = lastModified.toISOString();
      
      // 方式1: 从 YAML frontmatter 提取（新文章）
      const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        const titleM = fm.match(/^title:\s*(.+)$/m);
        const dateM = fm.match(/^publishDate:\s*(.+)$/m);
        if (titleM) title = titleM[1].trim();
        if (dateM) date = dateM[1].trim();
      } else {
        // 方式2: 从内容提取（旧文章）
        // 提取标题（# 标题，可能前面有空白）
        const titleM = content.match(/^\s*#\s+(.+)$/m);
        if (titleM) title = titleM[1].trim();
        
        // 提取日期（> 爬取时间：... 或 > 发布时间：...）
        const dateM = content.match(/(?:爬取|发布)时间：\s*([\dTZ:-]+)/i)
                    || content.match(/\*\*\s*发布时间：\s*\*\*\s*([\dTZ:-]+)/i);
        if (dateM) date = dateM[1].trim();
      }
      
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
  
  // 4. 生成 manifest.json（兼容现有格式）
  const manifest = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    total: posts.length,
    posts: posts.sort((a, b) => new Date(b.date) - new Date(a.date))
  };
  
  const manifestContent = JSON.stringify(manifest, null, 2);
  
  // 5. 上传到 R2
  const putCmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: 'manifest.json',
    Body: manifestContent,
    ContentType: 'application/json; charset=utf-8',
  });
  await s3.send(putCmd);
  console.log(`[crawl-cnblogs] manifest.json 已更新（${posts.length} 篇文章）`);
}

// 主函数（爬取新文章）
async function main() {
  console.log('[crawl-cnblogs] 开始爬取...');
  
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
  let targetTitle = null;
  for (const url of links) {
    const { title } = await fetchArticle(url);
    if (!existingTitles.has(title)) {
      targetUrl = url;
      targetTitle = title;
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
  const { title, markdown, publishDate } = await fetchArticle(targetUrl);
  const key = await uploadToR2(title, markdown, publishDate);
  console.log(`[crawl-cnblogs] ✅ 上传成功：${key}`);
  
  // 6. 更新 manifest.json
  await updateManifest();
  console.log('[crawl-cnblogs] ✅ manifest.json 已更新');
}

// 命令行参数处理
if (process.argv.includes('--fix-manifest')) {
  // 只修复 manifest.json，不爬取新文章
  (async () => {
    console.log('[crawl-cnblogs] --fix-manifest 模式：只修复 manifest.json');
    try {
      await updateManifest();
      console.log('[crawl-cnblogs] ✅ manifest.json 已修复');
      process.exit(0);
    } catch (err) {
      console.error('[crawl-cnblogs] 错误：', err.message);
      process.exit(1);
    }
  })();
} else {
  // 正常模式：爬取新文章
  main().catch(err => {
    console.error('[crawl-cnblogs] 错误：', err.message);
    process.exit(1);
  });
}
