// fix-manifest-tags.ts
// 读取 R2 中所有 markdown 文章，用 AI 修复 frontmatter 的分类和标签，同步更新 manifest.json
import https from 'node:https';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import type { _Object } from '@aws-sdk/client-s3';
import { writeWorkflowResult, elapsed } from '../../lib/workflow-result.js';

const R2_ENDPOINT = `https://${process.env.CF_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`;
const R2_BUCKET = process.env.R2_BLOG_BUCKET ?? 'songdaochuanshu-static';

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_KEY ?? '',
  },
});

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const ZHIPU_MODEL = 'glm-4-flash';

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
  title: string;
  date: string;
  category: string;
  tags: string[];
  layout: string;
  description: string;
}

interface Article {
  key: string;
  content: string;
}

// ──────────────────────────────────────────────
// 通用：调用智谱 AI
// ──────────────────────────────────────────────
function callZhipu(prompt: string, maxTokens = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ZHIPU_API_KEY) return reject(new Error('未设置 ZHIPU_API_KEY'));
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
// 主逻辑：修复文章 frontmatter + manifest
// ──────────────────────────────────────────────
async function main(): Promise<void> {
  if (!ZHIPU_API_KEY) {
    console.error('[fix-manifest-tags] 错误：未设置 ZHIPU_API_KEY');
    process.exit(1);
  }

  const startTime = Date.now();
  console.log('[fix-manifest-tags] 扫描 R2 文章...');

  const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'blog/', MaxKeys: 1000 });
  const response = await s3.send(listCmd);

  const articles: Article[] = [];
  for (const obj of (response.Contents ?? []) as _Object[]) {
    if (!obj.Key || !obj.Key.endsWith('.md')) continue;
    try {
      const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key });
      const { Body } = await s3.send(getCmd);
      const content = await Body!.transformToString();
      articles.push({ key: obj.Key, content });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[fix-manifest-tags] 读取 ${obj.Key} 失败：${msg}`);
    }
  }

  console.log(`[fix-manifest-tags] 共找到 ${articles.length} 篇文章`);

  let fixed = 0;
  const manifestPosts: ManifestPost[] = [];

  for (const article of articles) {
    const { key, content } = article;

    // 解析 frontmatter
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    let fm = fmMatch?.[1] ?? '';
    const body = fmMatch ? content.slice(fmMatch[0].length) : content;

    // 提取标题
    let title = '未知标题';
    const titleM = fm.match(/^title:\s*(.+)$/m);
    if (titleM) title = titleM[1].trim();
    else {
      const h1 = body.match(/^\s*#\s+(.+)$/m);
      if (h1) title = h1[1].trim();
    }

    // 提取日期
    let date = '';
    const dateM = fm.match(/^(?:publishDate|date):\s*(.+)$/m);
    if (dateM) date = dateM[1].trim();

    // 检查是否已有分类标签
    const catM = fm.match(/^category:\s*(.+)$/m);
    const tagsM = fm.match(/^tags:\s*(.+)$/m);
    const hasCategory = !!catM && catM[1].trim() !== '' && catM[1].trim() !== 'blog' && catM[1].trim() !== '技术';
    const hasTags = !!tagsM && (() => { try { return (JSON.parse(tagsM[1].trim()) as unknown[]).length > 0; } catch { return false; } })();

    let category: string;
    let tags: string[];

    if (hasCategory && hasTags) {
      // 已有有效分类标签，直接用
      category = catM![1].trim();
      try { tags = JSON.parse(tagsM![1].trim()) as string[]; } catch { tags = []; }
      console.log(`  ⏭️  ${title} — 已有分类[${category}]，跳过 AI`);
    } else {
      // 需要 AI 补充
      const snippet = body.replace(/[#*`>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000);
      try {
        const result = await askAIForCategoryAndTags(title, snippet);
        category = result.category || '技术';
        tags = result.tags || [];
        console.log(`  ✅ ${title} → ${category} / ${JSON.stringify(tags)}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ❌ ${title} — AI 失败：${msg}`);
        category = catM ? catM[1].trim() : '技术';
        tags = tagsM ? (() => { try { return JSON.parse(tagsM[1].trim()) as string[]; } catch { return []; } })() : [];
      }

      // 修复 frontmatter：替换或添加 category 和 tags
      if (fmMatch) {
        if (fm.match(/^category:\s*/m)) {
          fm = fm.replace(/^category:\s*.*$/m, `category: ${category}`);
        } else {
          fm = fm.trimEnd() + `\ncategory: ${category}`;
        }
        if (fm.match(/^tags:\s*/m)) {
          fm = fm.replace(/^tags:\s*.*$/m, `tags: ${JSON.stringify(tags)}`);
        } else {
          fm = fm.trimEnd() + `\ntags: ${JSON.stringify(tags)}`;
        }
        // 确保有 layout: post
        if (!fm.match(/^layout:\s*/m)) {
          fm = fm.trimEnd() + `\nlayout: post`;
        }
        const newContent = `---\n${fm}\n---${body}`;
        const putCmd = new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: newContent,
          ContentType: 'text/markdown; charset=utf-8',
        });
        await s3.send(putCmd);
        fixed++;
      }
    }

    // 收集 manifest 数据
    manifestPosts.push({
      path: `/${key}`,
      key,
      title,
      date: date || new Date().toISOString(),
      category,
      tags,
      layout: 'post',
      description: body.replace(/[#*`>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120) + '...',
    });
  }

  // 更新 manifest.json
  const manifest = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    total: manifestPosts.length,
    posts: manifestPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };

  const putCmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: 'manifest.json',
    Body: JSON.stringify(manifest, null, 2),
    ContentType: 'application/json; charset=utf-8',
  });
  await s3.send(putCmd);

  console.log(`[fix-manifest-tags] ✅ 完成！修复 ${fixed} 篇文章 frontmatter，manifest 共 ${manifestPosts.length} 篇`);

  writeWorkflowResult({
    success: true,
    workflow: 'fix-manifest-tags',
    timestamp: new Date().toISOString(),
    duration: elapsed(startTime),
    stats: { total: articles.length, fixed, manifest: manifestPosts.length },
    details: manifestPosts.slice(0, 20).map(p => ({ title: p.title, category: p.category, tags: p.tags })),
  });
}

main().catch((e: Error) => {
  writeWorkflowResult({
    success: false,
    workflow: 'fix-manifest-tags',
    timestamp: new Date().toISOString(),
    stats: {},
    details: [],
    error: e.message,
  });
  console.error('[fix-manifest-tags] 错误：', e.message);
  process.exit(1);
});
