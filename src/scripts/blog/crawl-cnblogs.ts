// crawl-cnblogs.ts
// 爬取博客园首页推荐文章，去重后上传到 R2 songdaochuanshu-static 桶

import https from 'node:https';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { writeWorkflowResult, elapsed } from '../../lib/workflow-result.js';

// R2 配置
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

// 智谱 AI 配置
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const ZHIPU_MODEL = 'glm-4-flash';

const CNBLOGS_HOME = 'https://www.cnblogs.com/';

interface ZhipuResponse {
  choices?: { message?: { content?: string } }[];
}

interface CategoryTagsResult {
  category: string;
  tags: string[];
}

interface ManifestPost {
  path: string;
  key: string;
  category: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  layout: string;
}

// ──────────────────────────────────────────────
// 通用：调用智谱 AI
// ──────────────────────────────────────────────
function callZhipu(prompt: string, maxTokens = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ZHIPU_API_KEY) {
      return reject(new Error('未设置 ZHIPU_API_KEY'));
    }
    const payload = JSON.stringify({
      model: ZHIPU_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: maxTokens,
    });

    const options = {
      hostname: 'open.bigmodel.cn',
      path: '/api/paas/v4/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => {
        try {
          const response = JSON.parse(data) as ZhipuResponse;
          if (response.choices?.[0]?.message?.content) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error(`AI 返回格式错误：${data}`));
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          reject(new Error(`解析 AI 响应失败（${msg}）：${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseJSON<T = unknown>(raw: string): T {
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/^\s*(\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1] ?? raw;
  return JSON.parse(jsonStr.trim()) as T;
}

// ──────────────────────────────────────────────
// AI 分类 & 标签
// ──────────────────────────────────────────────
async function askAIForCategoryAndTags(title: string, contentSnippet: string): Promise<CategoryTagsResult> {
  const prompt = `你是技术博客分类专家。根据文章标题和内容片段，给出最合适的分类和标签。

文章标题：${title}
内容片段：
${contentSnippet.substring(0, 800)}

从以下分类中选择**唯一一个**最匹配的：
AI、前端、后端、DevOps、DevTools、数据库、安全、云计算、性能优化、开源、Python、JavaScript、TypeScript、Rust、Go、Java、C/C++、Node.js、技术

再给出 3-5 个标签，要求：
- 用中文，2-4 个字
- 是文章的核心技术主题，不是从标题硬切的词
- 优先用技术领域词（如 Docker、微服务、CI/CD、监控、容器化）
- 不要出现"为什么"、"如何"、"越来越"这种虚词

返回纯 JSON，不要代码块：
{"category": "分类名", "tags": ["标签1", "标签2", "标签3"]}`;

  const raw = await callZhipu(prompt, 300);
  return parseJSON<CategoryTagsResult>(raw);
}

// ──────────────────────────────────────────────
// 爬虫逻辑
// ──────────────────────────────────────────────

// 获取 HTML
function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 从 HTML 提取文章链接
function extractArticleLinks(html: string): string[] {
const pattern = /href="(https?:\/\/www\.cnblogs\.com\/[^\/]+\/p\/\d+)"/g;
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const url = match[1];
    if (url) matches.add(url);
  }
  return Array.from(matches);
}

interface ArticleData {
  title: string;
  contentHtml: string;
  url: string;
  publishDate: string;
  textSnippet: string;
}

// 从文章页提取标题、内容、发布日期和纯文本摘要
async function fetchArticle(url: string): Promise<ArticleData> {
  const html = await fetchHtml(url);

  // 提取标题
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let title = titleMatch?.[1]?.trim() ?? '无标题';
  title = title.replace(/\s*-\s*[^-\s]+\s*-\s*博客园$/, '').replace(/\s*-\s*博客园$/, '').trim();

  // 提取发布日期
  let publishDate = '';
  const dateSpanMatch = html.match(/<span id="post-date"[^>]*>([^<]+)<\/span>/i);
  if (dateSpanMatch?.[1]) publishDate = dateSpanMatch[1].trim();
  if (!publishDate) {
    const pdMatch = html.match(/publishDate:\s*['"]([^'"]+)['"]/i);
    if (pdMatch?.[1]) publishDate = pdMatch[1].trim();
  }
  if (!publishDate) {
    const metaMatch = html.match(/<meta\s+property="article:published_time"\s+content="([^"]+)"/i);
    if (metaMatch?.[1]) publishDate = metaMatch[1].trim();
  }
  if (!publishDate) publishDate = new Date().toISOString();
  else {
    try { publishDate = new Date(publishDate).toISOString(); } catch { publishDate = new Date().toISOString(); }
  }

  // 提取文章内容（HTML）
  const bodyMatch = html.match(/<div id="cnblogs_post_body"[^>]*>([\s\S]*?)<\/div>/i);
  const contentHtml = bodyMatch?.[1] ?? '<p>内容获取失败</p>';

  // 提取纯文本摘要（用于 AI 分类）
  const textSnippet = contentHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1000);

  return { title, contentHtml, url, publishDate, textSnippet };
}

// 生成 Markdown 带 frontmatter
function buildMarkdown(title: string, publishDate: string, url: string, contentHtml: string, category: string, tags: string[]): string {
  return `---
title: ${title}
publishDate: ${publishDate}
source: ${url}
category: ${category}
tags: ${JSON.stringify(tags)}
layout: post
---

# ${title}

${contentHtml}

---
> 原文链接：${url}`;
}

// 从 R2 获取现有文章标题（用于去重）
async function getExistingTitles(): Promise<Set<string>> {
  const command = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/' });
  const response = await s3.send(command);
  const titles = new Set<string>();
  for (const obj of (response.Contents ?? [])) {
    if (obj.Key?.endsWith('.md')) {
      try {
        const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
        const { Body } = await s3.send(getCmd);
        const content = await Body!.transformToString();
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        if (titleMatch?.[1]) titles.add(titleMatch[1].trim());
      } catch {
        // 忽略读取错误
      }
    }
  }
  return titles;
}

// 上传到 R2
async function uploadToR2(title: string, content: string, publishDate: string): Promise<string> {
  let timestamp: number;
  try { timestamp = new Date(publishDate).getTime(); } catch { timestamp = Date.now(); }
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

// 更新 manifest.json（从 frontmatter 读取标题、日期、分类、标签）
async function updateManifest(): Promise<void> {
  console.log('[crawl-cnblogs] 开始更新 manifest.json...');

  const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/', MaxKeys: 1000 });
  const response = await s3.send(listCmd);

  const posts: ManifestPost[] = [];
  for (const obj of (response.Contents ?? [])) {
    if (!obj.Key?.endsWith('.md')) continue;

    let lastModified = new Date();
    try {
      const headCmd = new HeadObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
      const headData = await s3.send(headCmd);
      lastModified = headData.LastModified ?? new Date();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[crawl-cnblogs] 获取 ${obj.Key} 元数据失败：`, msg);
    }

    try {
      const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
      const { Body } = await s3.send(getCmd);
      const content = await Body!.transformToString();

      let title = '未知标题';
      let date = lastModified.toISOString();
      let category = '技术';
      let tags: string[] = [];

      const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (fmMatch?.[1]) {
        const fm = fmMatch[1];
        const titleM = fm.match(/^title:\s*(.+)$/m);
        const dateM = fm.match(/^(?:publishDate|date):\s*(.+)$/m);
        const catM = fm.match(/^category:\s*(.+)$/m);
        const tagsM = fm.match(/^tags:\s*(.+)$/m);
        if (titleM?.[1]) title = titleM[1].trim();
        if (dateM?.[1]) date = dateM[1].trim();
        if (catM?.[1]) category = catM[1].trim();
        if (tagsM?.[1]) {
          try { tags = JSON.parse(tagsM[1].trim()) as string[]; } catch { tags = []; }
        }
      } else {
        const titleM = content.match(/^\s*#\s+(.+)$/m);
        if (titleM?.[1]) title = titleM[1].trim();
      }

      posts.push({
        path: `/${obj.Key}`,
        key: obj.Key,
        category,
        title,
        date,
        description: '',
        tags,
        layout: 'post',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[crawl-cnblogs] 读取 ${obj.Key} 失败：`, msg);
    }
  }

  const manifest = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    total: posts.length,
    posts: posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };

  const putCmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: 'manifest.json',
    Body: JSON.stringify(manifest, null, 2),
    ContentType: 'application/json; charset=utf-8',
  });
  await s3.send(putCmd);
  console.log(`[crawl-cnblogs] manifest.json 已更新（${posts.length} 篇文章）`);
}

// 主函数（爬取新文章）
async function main(): Promise<void> {
  console.log('[crawl-cnblogs] 开始爬取...');

  const html = await fetchHtml(CNBLOGS_HOME);
  console.log(`[crawl-cnblogs] 首页 HTML 长度：${html.length}`);

  const links = extractArticleLinks(html);
  console.log(`[crawl-cnblogs] 找到 ${links.length} 篇文章`);

  if (links.length === 0) {
    console.log('[crawl-cnblogs] 未找到文章');
    return;
  }

  const existingTitles = await getExistingTitles();
  console.log(`[crawl-cnblogs] R2 已有 ${existingTitles.size} 篇文章`);

  // 找一篇不重复的文章
  let targetUrl: string | null = null;
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

  // 获取内容
  const { title, contentHtml, publishDate, textSnippet } = await fetchArticle(targetUrl);

  // AI 生成分类和标签
  let category = '技术';
  let tags: string[] = [];
  if (ZHIPU_API_KEY) {
    try {
      console.log('[crawl-cnblogs] 🏷️  AI 生成分类标签...');
      const result = await askAIForCategoryAndTags(title, textSnippet);
      category = result.category || '技术';
      tags = result.tags || [];
      console.log(`[crawl-cnblogs] AI 分类: ${category} | 标签: ${JSON.stringify(tags)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[crawl-cnblogs] AI 分类失败，使用默认：${msg}`);
    }
  } else {
    console.log('[crawl-cnblogs] ⚠️ 未设置 ZHIPU_API_KEY，跳过 AI 分类');
  }

  // 生成 Markdown 并上传
  const markdown = buildMarkdown(title, publishDate, targetUrl, contentHtml, category, tags);
  const key = await uploadToR2(title, markdown, publishDate);
  console.log(`[crawl-cnblogs] ✅ 上传成功：${key}`);

  await updateManifest();
  console.log('[crawl-cnblogs] ✅ manifest.json 已更新');

  writeWorkflowResult({
    success: true,
    workflow: 'crawl-cnblogs',
    timestamp: new Date().toISOString(),
    stats: { found: links.length, existing: existingTitles.size, new: targetUrl ? 1 : 0 },
    details: targetUrl ? [{ title, url: targetUrl, category, tags, status: '已上传' }] : [],
  });
}

// 批量清理文章的爬取痕迹
async function cleanArticles(): Promise<void> {
  console.log('[crawl-cnblogs] 开始清理文章...');

  const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/', MaxKeys: 1000 });
  const response = await s3.send(listCmd);

  let cleaned = 0;
  for (const obj of (response.Contents ?? [])) {
    if (!obj.Key?.endsWith('.md')) continue;

    try {
      const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
      const { Body } = await s3.send(getCmd);
      let content = await Body!.transformToString();

      content = content.replace(/^>\s*原文：\[[^\]]+\]\([^)]+\)\s*$/gm, '');
      content = content.replace(/^>\s*来源：博客园推荐文章\s*$/gm, '');
      content = content.replace(/^>\s*爬取时间：[^\s]*\s*$/gm, '');
      content = content.replace(/\n{3,}/g, '\n\n');

      const sourceMatch = content.match(/^source:\s*(.+)$/m);
      if (sourceMatch?.[1]) {
        const sourceUrl = sourceMatch[1].trim();
        if (!content.match(/---\s*\n>\s*原文链接：/m)) {
          content = content.replace(/---\s*\n\n#\s/m, `---\n\n# `);
          content = content.trimEnd() + '\n\n---\n> 原文链接：' + sourceUrl;
        }
      }

      const putCmd = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: obj.Key,
        Body: content,
        ContentType: 'text/markdown; charset=utf-8',
      });
      await s3.send(putCmd);
      cleaned++;
      console.log(`[crawl-cnblogs] ✅ 已清理：${obj.Key}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[crawl-cnblogs] 清理 ${obj.Key} 失败：${msg}`);
    }
  }

  console.log(`[crawl-cnblogs] 共清理 ${cleaned} 篇文章`);
  await updateManifest();
}

// 命令行参数处理
if (process.argv.includes('--clean-articles')) {
  void (async () => {
    const startTime = Date.now();
    console.log('[crawl-cnblogs] --clean-articles 模式：批量清理爬取痕迹');
    try {
      await cleanArticles();
      console.log('[crawl-cnblogs] ✅ 文章清理完成');
      writeWorkflowResult({ success: true, workflow: 'crawl-cnblogs-clean', timestamp: new Date().toISOString(), duration: elapsed(startTime), stats: {}, details: [] });
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writeWorkflowResult({ success: false, workflow: 'crawl-cnblogs-clean', timestamp: new Date().toISOString(), stats: {}, details: [], error: msg });
      console.error('[crawl-cnblogs] 错误：', msg);
      process.exit(1);
    }
  })();
} else if (process.argv.includes('--fix-manifest')) {
  void (async () => {
    const startTime = Date.now();
    console.log('[crawl-cnblogs] --fix-manifest 模式：只修复 manifest.json');
    try {
      await updateManifest();
      console.log('[crawl-cnblogs] ✅ manifest.json 已修复');
      writeWorkflowResult({ success: true, workflow: 'crawl-cnblogs-fix-manifest', timestamp: new Date().toISOString(), duration: elapsed(startTime), stats: {}, details: [] });
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writeWorkflowResult({ success: false, workflow: 'crawl-cnblogs-fix-manifest', timestamp: new Date().toISOString(), stats: {}, details: [], error: msg });
      console.error('[crawl-cnblogs] 错误：', msg);
      process.exit(1);
    }
  })();
} else {
  main().catch((err: Error) => {
    writeWorkflowResult({ success: false, workflow: 'crawl-cnblogs', timestamp: new Date().toISOString(), stats: {}, details: [], error: err.message });
    console.error('[crawl-cnblogs] 错误：', err.message);
    process.exit(1);
  });
}
