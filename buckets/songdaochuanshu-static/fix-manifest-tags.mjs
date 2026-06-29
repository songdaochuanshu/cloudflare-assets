// fix-manifest-tags.mjs
// 读取 R2 manifest.json，为每篇历史文章补充分类和标签（基于文件名 slug 提取话题）
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const R2_ENDPOINT = `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_BUCKET = process.env.R2_BLOG_BUCKET || 'songdaochuanshu-static';

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

// ─── 分类 & 标签映射（同 generate-article.mjs）───
const CATEGORY_MAP = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
  rust: 'Rust', golang: 'Go', java: 'Java', 'c-c++': 'C/C++', c: 'C/C++',
  react: '前端', vue: '前端', angular: '前端', html: '前端', css: '前端',
  nodejs: 'Node.js', node: 'Node.js',
  docker: 'DevOps', kubernetes: 'DevOps', k8s: 'DevOps', linux: 'DevOps', nginx: 'DevOps',
  git: 'DevTools', github: 'DevTools', vscode: 'DevTools', vim: 'DevTools',
  mysql: '数据库', postgresql: '数据库', mongodb: '数据库', redis: '数据库', sql: '数据库',
  api: '后端', rest: '后端', graphql: '后端', grpc: '后端',
  ai: 'AI', 'machine-learning': 'AI', 'deep-learning': 'AI', llm: 'AI',
  chatgpt: 'AI', openai: 'AI', gemini: 'AI',
  security: '安全', https: '安全', oauth: '安全',
  cloudflare: '云计算', aws: '云计算', azure: '云计算', gcp: '云计算',
  fastapi: 'Python', django: 'Python', flask: 'Python',
  spring: 'Java', springboot: 'Java',
  performance: '性能优化', optimization: '性能优化', cache: '性能优化',
  testing: '测试', ci: 'DevOps', cicd: 'DevOps',
  'hello-github': '开源', hellogithub: '开源',
};

function slugToCategory(slug) {
  const lower = slug.toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(kw)) return cat;
  }
  return '技术';
}

function slugToTags(slug) {
  const lower = slug.toLowerCase();
  const tags = new Set();
  for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(kw)) {
      tags.add(cat);
    }
  }
  // 从 slug 提取中文词
  const cnWords = (slug.match(/[\u4e00-\u9fa5]+/g) || []).slice(0, 2);
  cnWords.forEach(w => tags.add(w));
  return Array.from(tags).slice(0, 5);
}

// ─── 主逻辑 ───
async function main() {
  console.log('[fix-manifest-tags] 读取 manifest.json...');

  let manifest;
  try {
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: 'manifest.json' });
    const { Body } = await s3.send(cmd);
    const raw = await Body.transformToString();
    manifest = JSON.parse(raw);
  } catch (e) {
    console.error('[fix-manifest-tags] manifest.json 读取失败:', e.message);
    process.exit(1);
  }

  console.log(`[fix-manifest-tags] 当前共 ${manifest.posts?.length || 0} 篇文章`);

  let updated = 0;
  for (const post of manifest.posts) {
    const oldCat = post.category || '';
    const oldTags = post.tags || [];

    // 从 key 提取 slug（去掉 blog/ 前缀和 .md 后缀）
    const slug = (post.key || post.path || '').replace(/^blog\//, '').replace(/\.md$/, '');
    // 去掉日期前缀 YYYY-MM-DD-
    const topicSlug = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' ');

    const newCat = slugToCategory(topicSlug);
    const newTags = slugToTags(topicSlug);

    // 只有旧数据没有分类时才补填（避免覆盖已有正确数据的文章）
    const needsUpdate = !oldCat || oldCat === 'blog' || oldTags.length === 0;
    if (needsUpdate) {
      post.category = newCat;
      post.tags = newTags;
      updated++;
      console.log(`  ✅ ${post.title} → ${newCat} / ${JSON.stringify(newTags)}`);
    } else {
      console.log(`  ⏭️  ${post.title} 已有分类标签，跳过`);
    }
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.total = manifest.posts.length;

  const cmd2 = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: 'manifest.json',
    Body: JSON.stringify(manifest, null, 2),
    ContentType: 'application/json',
  });
  await s3.send(cmd2);

  console.log(`[fix-manifest-tags] ✅ 完成！共更新 ${updated} 篇文章，manifest 共 ${manifest.total} 篇`);
}

main().catch(e => {
  console.error('[fix-manifest-tags] 错误:', e.message);
  process.exit(1);
});
