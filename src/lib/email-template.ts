// email-template.ts
// 共享的邮件 HTML 模板，send-email.ts 与 email-notifier.ts 复用
// 抽出 buildEmailHTML 让它可被单测

export interface CrawlSummary {
  success?: boolean;
  error?: string;
  timestamp: string;
  duration?: string;
  stats: {
    downloaded: { total: number; r18?: number; normal?: number };
    skipped: number;
    failed: { total: number; download?: number; upload?: number };
  };
  details?: Array<{
    filename?: string;
    r2Key?: string;
    label?: string;
    size?: string;
    metadata?: {
      title?: string;
      author?: string;
      width?: number;
      height?: number;
      tags?: string[];
    } | null;
  }>;
  workflow?: string;
}

/**
 * 把爬取 summary 渲染为可发的 HTML 邮件正文
 */
export function buildEmailHTML(summary: CrawlSummary, status: string | undefined): string {
  const isSuccess = status === 'success';
  const statusEmoji = isSuccess ? '✅' : '❌';
  const statusText = isSuccess ? '爬取成功' : '爬取失败';
  const headerColor = isSuccess ? '#36a64f' : '#ff0000';

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${headerColor}; color: white; padding: 20px; border-radius: 5px; }
    .section { margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px; }
    .stat { display: inline-block; margin: 10px 20px 10px 0; }
    .stat-value { font-size: 24px; font-weight: bold; color: ${headerColor}; }
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
      <h1>${statusEmoji} ${summary.workflow ? summary.workflow : '爬虫'} 通知</h1>
      <p>状态: ${statusText}</p>
    </div>

    <div class="section">
      <h2>📊 统计</h2>
      <div class="stat">
        <div class="stat-value">${summary.stats.downloaded.total}</div>
        <div class="stat-label">下载成功</div>
      </div>
      <div class="stat">
        <div class="stat-value">${summary.stats.skipped}</div>
        <div class="stat-label">跳过</div>
      </div>
      <div class="stat">
        <div class="stat-value">${summary.stats.failed.total}</div>
        <div class="stat-label">失败</div>
      </div>
      <p>运行时长: ${summary.duration || '未知'}</p>
      <p>完成时间: ${new Date(summary.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
    </div>
`;

  if (summary.details && summary.details.length > 0) {
    html += `
    <div class="section">
      <h2>📝 详情 (前 10 条)</h2>
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
          <td>${item.filename ?? '-'}</td>
          <td>${item.label ?? '-'}</td>
          <td>${item.size ?? '-'}</td>
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

/**
 * 构造邮件主题行
 */
export function buildEmailSubject(summary: CrawlSummary, status: string | undefined): string {
  const isSuccess = status === 'success';
  const emoji = isSuccess ? '✅' : '❌';
  const label = summary.workflow ?? '爬虫';
  return `${emoji} ${label} 通知 - ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
}
