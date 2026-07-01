// send-email.ts
// 使用 Resend API 发送邮件通知
import { readFileSync } from 'node:fs';
import { buildEmailHTML, buildEmailSubject, type CrawlSummary } from '../lib/email-template.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Cloudflare Assets <noreply@ai-email.openserve.cloud>';
const STATUS = process.env.WORKFLOW_STATUS; // success 或 failure

if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
  console.error('❌ 缺少环境变量: RESEND_API_KEY 或 NOTIFY_EMAIL');
  process.exit(1);
}

// 读取爬取结果
let summary: CrawlSummary;
try {
  const summaryPath = './crawl-summary.json';
  summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as CrawlSummary;
} catch {
  // ignore
  summary = {
    success: false,
    error: '无法读取 crawl-summary.json',
    timestamp: new Date().toISOString(),
    stats: {
      downloaded: { total: 0 },
      skipped: 0,
      failed: { total: 0 },
    },
  };
}

// 发送邮件
async function sendEmail(): Promise<void> {
  const html = buildEmailHTML(summary, STATUS);
  const subject = buildEmailSubject(summary, STATUS);

  const payload = {
    from: EMAIL_FROM,
    to: [NOTIFY_EMAIL],
    subject: subject,
    html: html,
  };

  console.log('发送邮件到:', NOTIFY_EMAIL);
  console.log('主题:', subject);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ 邮件发送失败:', resp.status, errorText);
    process.exit(1);
  }

  const result: { id?: string } = (await resp.json()) as { id?: string };
  console.log('✅ 邮件发送成功! Email ID:', result.id);
}

sendEmail().catch((err: unknown) => {
  console.error('❌ 发送邮件时出错:', err);
  process.exit(1);
});

