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
  
  // Atom feed: <entry>...<title type="text">标题</title>...</entry>
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  const titles = new Set();
  
  for (const entry of entries) {
    const m = entry[1].match(/<title type="text">([^<]+)<\/title>/);
    if (!m) continue;
    let title = m[1].trim();
    // 去掉 " - 作者名" 后缀
    title = title.replace(/\s*-\s*[^-\s]+$/, '').trim();
    if (title.length >= 6 && title.length <= 60) titles.add(title);
    if (titles.size >= count) break;
  }
  
  console.log(`[generate-article] 从博客园获取 ${titles.size} 个标题`);
  return Array.from(titles);
}

// 从 manifest.json 获取已用标题
async function getUsedTitles() {
  try {
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: 'manifest.json' });
    const { Body } = await s3.send(cmd);
    const content = await Body.transformToString();
    const manifest = JSON.parse(content);
    const titles = (manifest.posts || []).map(p => p.title || '');
    console.log(`[generate-article] manifest 已用 ${titles.length} 个标题`);
    return titles;
  } catch (e) {
    console.log('[generate-article] manifest.json 未找到，视为空白');
    return [];
  }
}

// 用智谱 AI 判断标题（广告检测 + 相似度 + 质量评分）
function askAIForTitle(cnTitles, usedTitles) {
  return new Promise((resolve, reject) => {
    const prompt = `你是博客文章标题审核员。给定一批博客园标题（候选池）和已发布过的标题列表，请筛选出最适合用于生成技术博客文章的一个标题。

已发布的标题（不要重复或相似）：
${usedTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

候选标题池：
${cnTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

请从候选池中选出**唯一一个**最合适的标题，返回 JSON 格式：
{
  "chosen": "被选中的标题"（从候选池中选，写完整标题）,
  "reason": "简短说明选中原因"（20字以内）,
  "rejected": [
    {"title": "标题1", "reason": "拒绝原因"},
    {"title": "标题2", "reason": "拒绝原因"}
  ]
}

筛选标准（必须全部满足）：
1. 不是广告（不含"免费领取"、"扫码"、"加微信"、"点击领取"、"限时"、"优惠码"等营销词）
2. 不是重复或高度相似的标题（与已发布列表相比主题/用词相近的都要排除）
3. 是正经技术文章（能写出一篇 1000+ 字的有价值文章）
4. 有一定通用性（不是针对某个特定小众产品的）

只返回一个标题，不要返回多个。如果候选池全部不合适，返回空的 chosen（chosen: ""）。`;

    const payload = JSON.stringify({
      model: ZHIPU_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1500,
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
            const raw = response.choices[0].message.content;
            // 尝试从 markdown 代码块或纯文本中提取 JSON
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/^\s*(\{[\s\S]*\})/);
            const jsonStr = jsonMatch ? jsonMatch[1] : raw;
            const result = JSON.parse(jsonStr.trim());
            console.log('[generate-article] AI 标题筛选结果:', result.reason);
            resolve(result);
          } else {
            reject(new Error(`AI 返回格式错误：${data}`));
          }
        } catch (e) {
          reject(new Error(`解析 AI 响应失败（${e.message}）：${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// 选取一个未使用、不相似、无广告的标题
async function pickUnusedTopic() {
  const [cnTitles, usedTitles] = await Promise.all([
    fetchCnblogsTitles(30),
    getUsedTitles(),
  ]);

  if (cnTitles.length === 0) {
    throw new Error('博客园未获取到任何标题');
  }

  if (usedTitles.length === 0) {
    // 没有任何已用标题时，随机选一个（但仍做广告检测）
    const { chosen } = await askAIForTitle(cnTitles, []);
    if (!chosen) throw new Error('博客园标题全部不合适（含广告或非技术类），请稍后重试');
    console.log(`[generate-article] 选中标题: ${chosen}`);
    return chosen;
  }

  // AI 判断相似度和广告
  const result = await askAIForTitle(cnTitles, usedTitles);
  if (!result.chosen) {
    throw new Error('博客园标题全部不合适（含广告/重复/非技术类），请稍后重试');
  }

  // 打印被拒绝的标题及原因
  if (result.rejected && result.rejected.length > 0) {
    result.rejected.slice(0, 5).forEach(r => {
      console.log(`[generate-article] 跳过（${r.reason}）: ${r.title}`);
    });
  }

  console.log(`[generate-article] 选中标题: ${result.chosen}`);
  return result.chosen;
}

// ──────────────────────────────────────────────
// 智谱 AI 生成
// ──────────────────────────────────────────────
function generateArticle(topic) {
  return new Promise((resolve, reject) => {
    console.log(`[generate-article] 开始生成文章：《${topic}》`);
    
    const prompt = `你是一位技术博主，写了 10 年博客。请用你的真实口吻写一篇关于"${topic}"的文章。

写作要求：
- 像在和朋友聊天，口语化，可以用"其实"、"说实话"、"我觉着"
- 加入个人经历（可以是虚构的，但要合理），比如"上次我做一个项目时..."
- 不要罗列 1、2、3 点，要像讲故事一样写
- 不要用"总之"、"需要注意的是"这种教科书式的话
- 字数 1200-1800 字
- 输出 Markdown 格式

直接开始写，不要加"好的，我来写..."这种前缀。`;
    
    const payload = JSON.stringify({
      model: ZHIPU_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 2500,
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
            const content = response.choices[0].message.content;
            console.log(`[generate-article] ✅ 文章生成成功（${content.length} 字符）`);
            resolve(content);
          } else {
            reject(new Error(`智谱 AI 返回格式错误：${data}`));
          }
        } catch (e) {
          reject(new Error(`解析智谱 AI 响应失败：${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// 从文章内容提取标题
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '无标题';
}

// 上传到 R2
async function uploadToR2(topic, content) {
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
source: AI 生成（智谱 GLM-4-Flash）
tags: []
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
  console.log(`[generate-article] ✅ 上传成功：${filename}`);
  return filename;
}

// ──────────────────────────────────────────────
// 主函数
// ──────────────────────────────────────────────
async function main() {
  if (!ZHIPU_API_KEY) {
    console.error('[generate-article] 错误：未设置 ZHIPU_API_KEY');
    process.exit(1);
  }
  
  try {
    // 自动从博客园选取标题（过滤已用/相似）
    const topic = await pickUnusedTopic();
    console.log(`[generate-article] 主题：${topic}`);
    
    let content = await generateArticle(topic);
    
    // 去除 AI 味
    console.log('[generate-article] 🎯 去除 AI 味...');
    const { content: cleanContent, score, avgLen } = removeAISlop(content);
    
    await uploadToR2(topic, cleanContent);
    
    // 生成结果摘要
    const summary = {
      success: true,
      workflow: 'generate-article',
      timestamp: new Date().toISOString(),
      stats: {
        title: topic,
        wordCount: cleanContent.length,
        readabilityScore: score || 0,
        avgParagraphLen: avgLen || 0,
      },
      details: [{
        topic: topic,
        r2Key: `blog/${new Date().toISOString().split('T')[0]}-${topic}.md`,
        status: '上传成功',
      }],
    };
    
    writeFileSync('workflow-result.json', JSON.stringify(summary, null, 2));
    console.log('[generate-article] 📋 结果摘要已生成');
    console.log('[generate-article] ✅ 完成！');
  } catch (err) {
    console.error('[generate-article] 错误：', err.message);
    process.exit(1);
  }
}

main();
