// buckets/songdaochuanshu-static/generate-article.mjs
// 使用智谱 AI GLM-4-Flash 生成原创文章，上传到 R2

import https from 'https';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

// 文章主题列表
const TOPICS = [
  'Cloudflare Workers 实战教程',
  '前端性能优化技巧',
  'GitHub Actions CI/CD 最佳实践',
  'Rust 语言入门指南',
  'Docker 容器化部署',
  '个人博客搭建经验',
  '开源项目维护心得',
  '技术博客写作技巧',
];

// 调用智谱 AI 生成文章（优化 Prompt，减少 AI 味儿）
function generateArticle(topic) {
  return new Promise((resolve, reject) => {
    console.log(`[generate-article] 开始生成文章：《${topic}》`);
    
    // 优化后的 Prompt：让 AI 模仿真人博主（不要提名字，避免尴尬）
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
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,  // 提高随机性
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

// 上传到 R2（文件名用日期+标题 slug，不暴露 AI 生成）
async function uploadToR2(title, content) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const slug = title
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-') // 保留中文和英文，其他换成 -
    .replace(/^[-]+|[-]+$/g, '') // 去掉首尾的 -
    .substring(0, 50); // 限制长度
  
  const filename = `blog/${date}-${slug}.md`;
  
  const frontmatter = `---
title: ${title}
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

// 主函数
async function main() {
  let topic = process.argv[2];
  if (!topic) {
    topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  }
  
  console.log(`[generate-article] 主题：${topic}`);
  
  if (!ZHIPU_API_KEY) {
    console.error('[generate-article] 错误：未设置 ZHIPU_API_KEY');
    process.exit(1);
  }
  
  try {
    const content = await generateArticle(topic);
    const title = extractTitle(content);
    console.log(`[generate-article] 标题：《${title}》`);
    
    await uploadToR2(title, content);
    // manifest.json 由工作流单独更新
    
    console.log('[generate-article] ✅ 完成！');
    console.log('[generate-article] 提示：接下来请运行 crawl-cnblogs.mjs --fix-manifest 更新 manifest.json');
  } catch (err) {
    console.error('[generate-article] 错误：', err.message);
    process.exit(1);
  }
}

main();
