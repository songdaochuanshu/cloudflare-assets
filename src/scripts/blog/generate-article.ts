// generate-article.ts
// 从博客园抓取标题 → 智谱 AI 生成文章 → 上传到 R2

import https from 'node:https';
import { writeFileSync } from 'node:fs';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { removeAISlop } from '../../lib/anti-slop.js';

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

interface ZhipuResponse {
  choices?: { message?: { content?: string } }[];
}

interface ManifestPost {
  path: string;
  key: string;
  title: string;
  date: string;
  category: string;
  tags: string[];
  layout: string;
  description: string;
}

interface ChosenResult {
  chosen: string;
  reason?: string;
  rejected?: { title: string; reason: string }[];
}

interface CategoryTagsResult {
  category: string;
  tags: string[];
}

// ──────────────────────────────────────────────
// 通用:调用智谱 AI
// ──────────────────────────────────────────────
function callZhipu(prompt: string, maxTokens = 300): Promise<string> {
  return new Promise((resolve, reject) => {
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
            reject(new Error(`AI 返回格式错误:${data}`));
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          reject(new Error(`解析 AI 响应失败(${msg}):${data.substring(0, 200)}`));
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
  let jsonStr = jsonMatch?.[1] ?? raw;
  // 兜底：如果还有 ``` 残留，去掉
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  return JSON.parse(jsonStr) as T;
}

// ──────────────────────────────────────────────
// 博客园标题抓取
// ──────────────────────────────────────────────
function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 从博客园 Atom RSS 提取文章标题
async function fetchCnblogsTitles(count = 30): Promise<string[]> {
  const xml = await fetchHtml('https://feed.cnblogs.com/blog/sitehome/rss');

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  const titles = new Set<string>();

  for (const entry of entries) {
    const m = entry[1]?.match(/<title type="text">([^<]+)<\/title>/);
    if (!m?.[1]) continue;
    let title = m[1].trim();
    title = title.replace(/\s*-\s*[^-\s]+$/, '').trim();
    if (title.length >= 6 && title.length <= 60) titles.add(title);
    if (titles.size >= count) break;
  }

  console.log(`[generate-article] 从博客园获取 ${titles.size} 个标题`);
  return Array.from(titles);
}

// 从 R2 桶直接获取已用标题(比 manifest 更实时,并行跑也不会重复)
async function getUsedTitles(): Promise<string[]> {
  try {
    const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/', MaxKeys: 1000 });
    const { Contents } = await s3.send(listCmd);
    const titles: string[] = [];
    for (const obj of Contents ?? []) {
      if (!obj.Key?.endsWith('.md')) continue;
      try {
        const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
        const { Body } = await s3.send(getCmd);
        const content = await Body!.transformToString();
        const titleM = content.match(/^title:\s*(.+)$/m);
        if (titleM?.[1]) titles.push(titleM[1].trim());
      } catch {
        // ignore read errors
      }
    }
    console.log(`[generate-article] R2 已有 ${titles.length} 篇文章`);
    return titles;
  } catch (e) {
    console.log('[generate-article] R2 读取失败,视为空白');
    return [];
  }
}

// 用智谱 AI 判断标题(广告检测 + 相似度 + 质量评分)
async function askAIForTitle(cnTitles: string[], usedTitles: string[]): Promise<ChosenResult> {
  const prompt = `你是博客文章标题审核员。给定一批博客园标题(候选池)和已发布过的标题列表,请筛选出最适合用于生成技术博客文章的一个标题。

已发布的标题(不要重复或相似):
${usedTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

候选标题池:
${cnTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

请从候选池中选出**唯一一个**最合适的标题,返回 JSON 格式:
{
  "chosen": "被选中的标题"(从候选池中选,写完整标题),
  "reason": "简短说明选中原因"(20字以内),
  "rejected": [
    {"title": "标题1", "reason": "拒绝原因"},
    {"title": "标题2", "reason": "拒绝原因"}
  ]
}

筛选标准(必须全部满足):
1. 不是广告(不含"免费领取"、"扫码"、"加微信"、"点击领取"、"限时"、"优惠码"等营销词)
2. 不是重复或高度相似的标题(与已发布列表相比主题/用词相近的都要排除)
3. 是正经技术文章(能写出一篇 1000+ 字的有价值文章)
4. 有一定通用性(不是针对某个特定小众产品的)

只返回一个标题,不要返回多个。如果候选池全部不合适,返回空的 chosen(chosen: "")。`;

  const raw = await callZhipu(prompt, 1500);
  console.log('[generate-article] AI 标题筛选完成');
  return parseJSON<ChosenResult>(raw);
}

// 检查 R2 中是否已有该标题的文章
async function r2FileExists(topic: string): Promise<boolean> {
  const date = new Date().toISOString().split('T')[0] ?? '';
  const slug = topic.toLowerCase().replace(/[^\w一-龥]+/g, '-').replace(/^[-]+|[-]+$/g, '').substring(0, 50);
  const filename = `blog/${date}-${slug}.md`;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: filename }));
    return true;
  } catch {
    return false;
  }
}

// 选取一个未使用、不相似、无广告的标题(如果 R2 已有则自动换下一个)
async function pickUnusedTopic(): Promise<string> {
  const [cnTitles, usedTitles] = await Promise.all([
    fetchCnblogsTitles(30),
    getUsedTitles(),
  ]);

  if (cnTitles.length === 0) {
    throw new Error('博客园未获取到任何标题');
  }

  // 随机打乱候选池顺序,避免并行时 AI 总是选同一个
  const shuffled = [...cnTitles].sort(() => Math.random() - 0.5);

  const result = await askAIForTitle(shuffled, usedTitles.length > 0 ? usedTitles : []);
  if (!result.chosen) {
    throw new Error('博客园标题全部不合适(含广告/重复/非技术类),请稍后重试');
  }

  // 按优先级排列:AI 选中的 + 被拒绝中可用的备选
  const candidates = [result.chosen, ...(result.rejected ?? []).map((r) => r.title)];

  for (const title of candidates) {
    if (await r2FileExists(title)) {
      console.log(`[generate-article] 跳过(R2 已存在):${title}`);
      continue;
    }
    console.log(`[generate-article] 选中标题: ${title}`);
    return title;
  }

  throw new Error('所有候选标题在 R2 中都已存在,请稍后重试');
}

// ──────────────────────────────────────────────
// 智谱 AI 生成
// ──────────────────────────────────────────────
async function generateArticle(topic: string): Promise<string> {
  console.log(`[generate-article] 开始生成文章:《${topic}》`);

  const prompt = `你是一位技术博主,写了 10 年博客。请用你的真实口吻写一篇关于"${topic}"的文章。

写作要求：
- 像在和朋友聊天，口语化，可以用"其实"、"说实话"、"我觉着"
- 加入个人经历（可以是虚构的，但要合理），比如"上次我做一个项目时..."
- 不要罗列 1、2、3 点，要像讲故事一样写
- 不要用"总之"、"总的来说"、"综上所述"这种教科书式的话
- 字数 1200-1800 字
- 输出 Markdown 格式

直接开始写，不要加"好的，我来写..."这种前缀。

⚠️ 最重要的一条：文章最后一个论点写完就立刻结束。不要写任何总结、不要写"总之"、不要写"以上就是"、不要写"希望对大家有帮助"、不要写"拜拜"、不要写"下次见"。写完正文直接停笔。`;

  const content = await callZhipu(prompt, 2500);
  console.log(`[generate-article] ✅ 文章生成成功(${content.length} 字符)`);
  return content;
}

// ──────────────────────────────────────────────
// AI 分类 & 标签生成
// ──────────────────────────────────────────────
async function askAIForCategoryAndTags(title: string, contentSnippet: string): Promise<CategoryTagsResult> {
  const prompt = `你是技术博客分类专家。根据文章标题和内容片段,给出最合适的分类和标签。

文章标题:${title}
内容片段:
${contentSnippet.substring(0, 800)}

从以下分类中选择**唯一一个**最匹配的:
AI、前端、后端、DevOps、DevTools、数据库、安全、云计算、性能优化、开源、Python、JavaScript、TypeScript、Rust、Go、Java、C/C++、Node.js、技术

再给出 3-5 个标签,要求:
- 用中文,2-4 个字
- 是文章的核心技术主题,不是从标题硬切的词
- 优先用技术领域词(如 Docker、微服务、CI/CD、监控、容器化)
- 不要出现"为什么"、"如何"、"越来越"这种虚词

返回纯 JSON,不要代码块:
{"category": "分类名", "tags": ["标签1", "标签2", "标签3"]}`;

  const raw = await callZhipu(prompt, 300);
  const result = parseJSON<CategoryTagsResult>(raw);
  console.log(`[generate-article] AI 分类: ${result.category} | 标签: ${JSON.stringify(result.tags)}`);
  return result;
}

// ──────────────────────────────────────────────
// AI 润色：去 AI 味
// ──────────────────────────────────────────────
async function polishArticle(topic: string, content: string): Promise<string> {
  console.log(`[generate-article] 润色文章 (${content.length} 字符)...`);

  const prompt = `你是一个文章编辑。请把下面这篇技术博客润色一遍，让它读起来更像真人写的，不像 AI 生成的。

要求：
- 保持原文的技术内容和结构不变
- 删掉所有"总之"、"综上所述"、"希望通过本文"、"结语"这类总结性语句
- 删掉"嘿朋友们"、"今天咱们来聊聊"这类开场白
- 删掉"说实话"、"不得不说"、"最重要的是"这类口水话
- 不要加任何总结、结语、收尾段落，最后一个论点写完就结束
- 不要用感叹号，不要用"太棒了"、"非常强大"这种夸张表达
- 保持 1200-1800 字
- 输出纯 Markdown，不要加代码块标记

以下是原文：

${content}`;

  const result = await callZhipu(prompt, 3000);
  console.log(`[generate-article] ✅ 润色完成 (${result.length} 字符)`);
  return result;
}

// 从文章内容提取标题
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? '无标题';
}

// 上传到 R2
async function uploadToR2(topic: string, content: string, category: string, tags: string[]): Promise<string> {
  const date = new Date().toISOString().split('T')[0] ?? '';
  const slug = topic
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^[-]+|[-]+$/g, '')
    .substring(0, 50);

  const filename = `blog/${date}-${slug}.md`;

  const frontmatter = `---
title: ${topic}
date: ${new Date().toISOString()}
source: AI 生成(智谱 GLM-4-Flash)
category: ${category}
tags: ${JSON.stringify(tags)}
layout: post
---

`;

  const fullContent = frontmatter + content;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filename,
    Body: fullContent,
    ContentType: 'text/markdown; charset=utf-8',
  });

  await s3.send(command);
  console.log(`[generate-article] ✅ 上传成功:${filename}`);
  return filename;
}

// ──────────────────────────────────────────────
// manifest 更新
// ──────────────────────────────────────────────
async function updateManifest(post: ManifestPost): Promise<void> {
  try {
    let manifest: { version: string; generatedAt: string; total: number; posts: ManifestPost[] } = {
      version: '1.0',
      generatedAt: '',
      total: 0,
      posts: [],
    };
    try {
      const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: 'manifest.json' });
      const { Body } = await s3.send(cmd);
      const raw = await Body!.transformToString();
      manifest = JSON.parse(raw);
    } catch {
      // manifest 不存在,正常
    }

    if (!manifest.posts.some((p) => p.title === post.title)) {
      manifest.posts.unshift(post);
      manifest.total = manifest.posts.length;
      manifest.generatedAt = new Date().toISOString();
    }

    const body = JSON.stringify(manifest, null, 2);
    const cmd2 = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: 'manifest.json',
      Body: body,
      ContentType: 'application/json',
    });
    await s3.send(cmd2);
    console.log('[generate-article] ✅ manifest.json 已更新');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[generate-article] manifest 更新失败:', msg);
  }
}

// ──────────────────────────────────────────────
// 主函数
// ──────────────────────────────────────────────
async function main(): Promise<void> {
  if (!ZHIPU_API_KEY) {
    console.error('[generate-article] 错误:未设置 ZHIPU_API_KEY');
    process.exit(1);
  }

  try {
    const topic = await pickUnusedTopic();
    console.log(`[generate-article] 主题:${topic}`);

    const content = await generateArticle(topic);

    // 去除 AI 味
    console.log('[generate-article] 🎯 去除 AI 味...');
    const { content: cleanContent, score, avgLen } = removeAISlop(content);

    // AI 润色：让文章更像人写的
    console.log('[generate-article] ✨ AI 润色...');
    const polished = await polishArticle(topic, cleanContent);

    // AI 生成分类和标签
    console.log('[generate-article] 🏷️  AI 生成分类标签...');
    const { category, tags } = await askAIForCategoryAndTags(topic, polished);

    const filename = await uploadToR2(topic, polished, category, tags);

    const date = new Date().toISOString().split('T')[0] ?? '';
    const slug = topic.toLowerCase().replace(/[^\w一-龥]+/g, '-').replace(/^[-]+|[-]+$/g, '').substring(0, 50);
    const r2Key = `blog/${date}-${slug}.md`;
    await updateManifest({
      path: `/${r2Key}`,
      key: r2Key,
      title: topic,
      date: new Date().toISOString(),
      category,
      tags,
      layout: 'post',
      description: polished.replace(/[#*`]/g, '').substring(0, 120) + '...',
    });

    const summary = {
      success: true,
      workflow: 'generate-article',
      timestamp: new Date().toISOString(),
      stats: {
        title: topic,
        category,
        tags,
        wordCount: cleanContent.length,
        readabilityScore: score || 0,
        avgParagraphLen: avgLen || 0,
      },
      details: [{
        topic: topic,
        category,
        tags,
        r2Key,
        status: '上传成功',
      }],
    };

    writeFileSync('workflow-result.json', JSON.stringify(summary, null, 2));
    console.log('[generate-article] 📋 结果摘要已生成');
    console.log('[generate-article] ✅ 完成!');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-article] 错误:', msg);
    process.exit(1);
  }
}

main();
