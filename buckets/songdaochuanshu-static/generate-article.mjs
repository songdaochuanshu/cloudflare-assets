// buckets/songdaochuanshu-static/generate-article.mjs
// 使用智谱 AI GLM-4-Flash 生成原创文章，上传到 R2

import https from 'https';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

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
const ZHIPU_MODEL = 'glm-4-flash'; // 免费模型

// 文章主题列表（可扩展）
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

// 调用智谱 AI 生成文章
function generateArticle(topic) {
  return new Promise((resolve, reject) => {
    console.log(`[generate-article] 开始生成文章：《${topic}》`);
    
    const prompt = `请写一篇关于"${topic}"的技术文章，要求：
1. 原创度高，有个人见解
2. 结构清晰（引言、正文、总结）
3. 字数 1000-1500 字
4. 语言通俗易懂，适合技术博客
5. 包含代码示例（如果适用）
6. 输出格式：Markdown

直接输出文章内容，不要加任何解释或前缀。`;
    
    const payload = JSON.stringify({
      model: ZHIPU_MODEL,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
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
async function uploadToR2(title, content) {
  const timestamp = Date.now();
  const filename = `blog/ai-${timestamp}.md`;
  
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

// 更新 manifest.json（调用 crawl-cnblogs.mjs --fix-manifest）
async function updateManifest() {
  console.log('[generate-article] 开始更新 manifest.json...');
  
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    const path = require('path');
    
    // 获取当前脚本所在目录
    const scriptDir = __dirname;
    const fixManifestScript = path.join(scriptDir, 'crawl-cnblogs.mjs');
    
    console.log(`[generate-article] 调用 ${fixManifestScript} --fix-manifest`);
    
    exec(`node "${fixManifestScript}" --fix-manifest`, {
      env: process.env
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('[generate-article] 更新 manifest.json 失败：', error.message);
        console.error('[generate-article] stderr:', stderr);
        reject(error);
      } else {
        console.log('[generate-article] ✅ manifest.json 已更新');
        console.log(stdout);
        resolve();
      }
    });
  });
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
    await updateManifest();
    
    console.log('[generate-article] ✅ 完成！');
  } catch (err) {
    console.error('[generate-article] 错误：', err.message);
    process.exit(1);
  }
}

main();
