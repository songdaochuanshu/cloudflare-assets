// send-email.ts
// 使用 Resend API 发送邮件通知
import { readFileSync } from 'node:fs';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Cloudflare Assets <noreply@ai-email.openserve.cloud>';
const STATUS = process.env.WORKFLOW_STATUS; // success 或 failure

if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
  console.error('❌ 缺少环境变量: RESEND_API_KEY 或 NOTIFY_EMAIL');
  process.exit(1);
}

interface CrawlSummary {
  success?: boolean;
  error?: string;
  timestamp: string;
  duration?: string;
  stats: {
    downloaded: { total: number };
    skipped: number;
    failed: { total: number };
  };
  details?: any[];
}

// 读取爬取结果
let summary: CrawlSummary;
try {
  const summaryPath = './crawl-summary.json';
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
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

// 构建邮件 HTML 内容
function buildEmailHTML(summary: CrawlSummary, status: string | undefined): string {
  const isSuccess = status === 'success';
  const statusEmoji = isSuccess ? '✅' : '❌';
  const statusText = isSuccess ? '爬取成功' : '爬取失败';

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${isSuccess ? '#36a64f' : '#ff0000'}; color: white; padding: 20px; border-radius: 5px; }
    .section { margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px; }
    .stat { display: inline-block; margin: 10px 20px 10px 0; }
    .stat-value { font-size: 24px; font-weight: bold; color: ${isSuccess ? '#36a64f' : '#ff0000'}; }
    .stat-label { font-size: 12px; color: #666; }
    .detail-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .detail-table th, .detail-table td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    .detail-table th { background: #f0f0f0; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${statusEmoji} Lolicon 爬虫通知</h1>
      <p>状态: ${statusText}</p>
    </div>
    
    <div class="section">
      <h2>📊 爬取统计</h2>
      <div class="stat">
        <div class="stat-value">${summary.stats.downloaded.total}</div>
        <div class="stat-label">下载成功</div>
      </div>
      <div class="stat">
        <div class="stat-value">${summary.stats.skipped}</div>
        <div class="stat-label">跳过(已存在)</div>
      </div>
      <div class="stat">
        <div class="stat-value">${summary.stats.failed.total}</div>
        <div class="stat-label">失败</div>
      </div>
      <p>运行时长: ${summary.duration || '未知'}</p>
      <p>完成时间: ${new Date(summary.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
    </div>
`;

  // 如果有详细信息，添加表格
  if (summary.details && summary.details.length > 0) {
    html += `
    <div class="section">
      <h2>📝 下载详情 (前 10 条)</h2>
      <table class="detail-table">
        <tr>
          <th>文件名</th>
          <th>分类</th>
          <th>大小</th>
          <th>标题</th>
          <th>作者</th>
        </tr>
    `;

    for (const item of summary.details.slice(0, 10)) {
      html += `
        <tr>
          <td>${item.filename}</td>
          <td>${item.label}</td>
          <td>${item.size}</td>
          <td>${item.metadata?.title || '-'}</td>
          <td>${item.metadata?.author || '-'}</td>
        </tr>
      `;
    }

    html += `
      </table>
      ${summary.details.length > 10 ? '<p>... 还有 ' + (summary.details.length - 10) + ' 条记录未显示</p>' : ''}
    </div>
    `;
  }

  // 如果有错误，显示错误信息
  if (summary.error) {
    html += `
    <div class="section">
      <h2>⚠️ 错误信息</h2>
      <pre style="background: #ffe6e6; padding: 10px; border-radius: 5px; overflow-x: auto;">${summary.error}</pre>
    </div>
    `;
  }

  html += `
    <div class="footer">
      <p>此邮件由 GitHub Actions 自动发送</p>
      <p>仓库: <a href="https://github.com/songdaochuanshu/cloudflare-assets">songdaochuanshu/cloudflare-assets</a></p>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

// 发送邮件
async function sendEmail(): Promise<void> {
  const html = buildEmailHTML(summary, STATUS);
  const subject = `${STATUS === 'success' ? '✅' : '❌'} Lolicon 爬虫通知 - ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

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

  const result: any = await resp.json();
  console.log('✅ 邮件发送成功! Email ID:', result.id);
}

sendEmail().catch((err) => {
  console.error('❌ 发送邮件时出错:', err);
  process.exit(1);
});
