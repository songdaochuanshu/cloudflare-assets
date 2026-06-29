// buckets/songdaochuanshu-static/generate-article.mjs
// 从博客园抓取标题 → 智谱 AI 生成文章 → 上传到 R2

import https from 'https';
import { writeFileSync } from 'fs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { removeAISlop } from '../../utils/anti-slop.mjs';

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

// 智谱 AI 配置
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const ZHIPU_MODEL = 'glm-4-flash';

// ──────────────────────────────────────────────
// 通用:调用智谱 AI
// ──────────────────────────────────────────────
function callZhipu(prompt, maxTokens = 300) {
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
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.choices && response.choices[0]) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error(`AI 返回格式错误:${data}`));
          }
        } catch (e) {
          reject(new Error(`解析 AI 响应失败(${e.message}):${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseJSON(raw) {
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/^\s*(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : raw;
  return JSON.parse(jsonStr.trim());
}

// ──────────────────────────────────────────────
// 博客园标题抓取
// ──────────────────────────────────────────────
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 从博客园 Atom RSS 提取文章标题
async function fetchCnblogsTitles(count = 30) {
  const xml = await fetchHtml('https://feed.cnblogs.com/blog/sitehome/rss');

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  const titles = new Set();

  for (const entry of entries) {
    const m = entry[1].match(/<title type="text">([^<]+)<\/title>/);
    if (!m) continue;
    let title = m[1].trim();
    title = title.replace(/\s*-\s*[^-\s]+$/, '').trim();
    if (title.length >= 6 && title.length <= 60) titles.add(title);
    if (titles.size >= count) break;
  }

  console.log(`[generate-article] 从博客园获取 ${titles.size} 个标题`);
  return Array.from(titles);
}

// 从 R2 桶直接获取已用标题(比 manifest 更实时,并行跑也不会重复)
async function getUsedTitles() {
  try {
    const { ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/', MaxKeys: 1000 });
    const { Contents } = await s3.send(listCmd);
    const titles = [];
    for (const obj of Contents || []) {
      if (!obj.Key.endsWith('.md')) continue;
      try {
        const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
        const { Body } = await s3.send(getCmd);
        const content = await Body.transformToString();
        const titleM = content.match(/^title:\s*(.+)$/m);
        if (titleM) titles.push(titleM[1].trim());
      } catch (_) {}
    }
    console.log(`[generate-article] R2 已有 ${titles.length} 篇文章`);
    return titles;
  } catch (e) {
    console.log('[generate-article] R2 读取失败,视为空白');
    return [];
  }
}

// 用智谱 AI 判断标题(广告检测 + 相似度 + 质量评分)
async function askAIForTitle(cnTitles, usedTitles) {
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
  return parseJSON(raw);
}

// 检查 R2 中是否已有该标题的文章
async function r2FileExists(topic) {
  const date = new Date().toISOString().split('T')[0];
  const slug = topic.toLowerCase().replace(/[^\w一-龥]+/g, '-').replace(/^[-]+|[-]+$/g, '').substring(0, 50);
  const filename = `blog/${date}-${slug}.md`;
  try {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: filename }));
    return true;
  } catch (_) {
    return false;
  }
}

// 选取一个未使用、不相似、无广告的标题(如果 R2 已有则自动换下一个)
async function pickUnusedTopic() {
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
  const candidates = [result.chosen, ...(result.rejected || []).map(r => r.title)];

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
async function generateArticle(topic) {
  console.log(`[generate-article] 开始生成文章:《${topic}》`);

  const prompt = `你是一位技术博主,写了 10 年博客。请用你的真实口吻写一篇关于"${topic}"的文章。

写作要求：
- 像在和朋友聊天，口语化，可以用“其实”、“说实话”、“我觉着”
- 加入个人经历（可以是虚构的，但要合理），比如“上次我做一个项目时...”
- 不要罗列 1、2、3 点，要像讲故事一样写
- 不要用“总之”、“总的来说”、“综上所述”这种教科书式的话
- 字数 1200-1800 字
- 输出 Markdown 格式

直接开始写，不要加“好的，我来写...”这种前缀。

⚠️ 最重要的一条：文章最后一个论点写完就立刻结束。不要写任何总结、不要写“总之”、不要写“以上就是”、不要写“希望对大家有帮助”、不要写“拜拜”、不要写“下次见”。写完正文直接停笔。`;

  const content = await callZhipu(prompt, 2500);
  console.log(`[generate-article] ✅ 文章生成成功(${content.length} 字符)`);
  return content;
}

// ──────────────────────────────────────────────
// AI 分类 & 标签生成
// ──────────────────────────────────────────────
async function askAIForCategoryAndTags(title, contentSnippet) {
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
  const result = parseJSON(raw);
  console.log(`[generate-article] AI 分类: ${result.category} | 标签: ${JSON.stringify(result.tags)}`);
  return result;
}

// 从文章内容提取标题
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '无标题';
}

// 上传到 R2
async function uploadToR2(topic, content, category, tags) {
  const date = new Date().toISOString().split('T')[0];
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
async function updateManifest(post) {
  try {
    let manifest = { version: '1.0', generatedAt: '', total: 0, posts: [] };
    try {
      const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: 'manifest.json' });
      const { Body } = await s3.send(cmd);
      const raw = await Body.transformToString();
      manifest = JSON.parse(raw);
    } catch (_) {
      // manifest 不存在,正常
    }

    if (!manifest.posts.some(p => p.title === post.title)) {
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
    console.error('[generate-article] manifest 更新失败:', e.message);
  }
}

// ──────────────────────────────────────────────
// 主函数
// ──────────────────────────────────────────────
async function main() {
  if (!ZHIPU_API_KEY) {
    console.error('[generate-article] 错误:未设置 ZHIPU_API_KEY');
    process.exit(1);
  }

  try {
    const topic = await pickUnusedTopic();
    console.log(`[generate-article] 主题:${topic}`);

    let content = await generateArticle(topic);

    // 去除 AI 味
    console.log('[generate-article] 🎯 去除 AI 味...');
    const { content: cleanContent, score, avgLen } = removeAISlop(content);

    // AI 生成分类和标签
    console.log('[generate-article] 🏷️  AI 生成分类标签...');
    const { category, tags } = await askAIForCategoryAndTags(topic, cleanContent);

    const filename = await uploadToR2(topic, cleanContent, category, tags);

    const date = new Date().toISOString().split('T')[0];
    const slug = topic.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^[-]+|[-]+$/g, '').substring(0, 50);
    const r2Key = `blog/${date}-${slug}.md`;
    await updateManifest({
      path: `/${r2Key}`,
      key: r2Key,
      title: topic,
      date: new Date().toISOString(),
      category,
      tags,
      layout: 'post',
      description: cleanContent.replace(/[#*`]/g, '').substring(0, 120) + '...',
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
    console.error('[generate-article] 错误:', err.message);
    process.exit(1);
  }
}

main();
