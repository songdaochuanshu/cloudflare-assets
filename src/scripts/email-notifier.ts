// utils/email-notifier.ts
// 通用邮件通知组件
// 用于所有 GitHub Actions 工作流的邮件通知
import { readFileSync } from 'node:fs';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const WORKFLOW_NAME = process.env.WORKFLOW_NAME || 'Unknown';
const WORKFLOW_STATUS = process.env.WORKFLOW_STATUS || 'unknown';

if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
  console.error('❌ 缺少环境变量: RESEND_API_KEY 或 NOTIFY_EMAIL');
  process.exit(1);
}

interface WorkflowResult {
  success?: boolean;
  workflow?: string;
  timestamp: string;
  duration?: string;
  stats?: Record<string, any>;
  details?: any[];
  error?: string;
  message?: string;
}

// 读取工作流结果文件
function loadWorkflowResult(): WorkflowResult {
  const possibleFiles = [
    './crawl-summary.json',
    './update-summary.json',
    './delete-summary.json',
    './workflow-result.json',
  ];

  for (const file of possibleFiles) {
    try {
      const content = readFileSync(file, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      // 继续尝试下一个文件
    }
  }

  // 如果所有文件都不存在，返回默认结果
  return {
    success: WORKFLOW_STATUS === 'success',
    workflow: WORKFLOW_NAME,
    timestamp: new Date().toISOString(),
    error: '无法读取工作流结果文件',
  };
}

// 根据工作流类型生成邮件内容
function buildEmailContent(result: WorkflowResult): string {
  const workflow = result.workflow || WORKFLOW_NAME;
  const isSuccess = result.success !== false;
  const statusEmoji = isSuccess ? '✅' : '❌';
  const statusText = isSuccess ? '成功' : '失败';

  // 工作流名称的中文映射
  const workflowNames: Record<string, string> = {
    'crawl-lolicon': 'Lolicon 图片爬虫',
    'update-images-info': '图片元数据更新',
    'delete-images': '图片删除任务',
    'delete-non-lolicon': '非 Lolicon 图片删除',
    'check-lolicon': '图片来源检查',
    'migrate': '数据迁移任务',
    'cleanup-blog': '博客清空',
    'crawl-cnblogs': '博客园文章爬取',
    'crawl-cnblogs-clean': '博客文章清理',
    'crawl-cnblogs-fix-manifest': '博客 Manifest 修复',
    'generate-article': 'AI 文章生成',
    'fix-manifest-tags': '文章标签修复',
    'delete-all-posts': '删除所有文章',
    'delete-first-posts': '删除前 N 篇文章',
    'delete-old-posts': '删除旧文章',
    'list-prefixes': 'R2 前缀列表',
    'enrich-metadata': '图片元数据补全',
    'fix-images-info-structure': 'images-info 结构修复',
  };

  const workflowDisplayName = workflowNames[workflow] || workflow;

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${isSuccess ? '#36a64f' : '#ff0000'}; color: white; padding: 30px 20px; border-radius: 5px 5px 0 0; }
    .header h1 { margin: 0 0 10px 0; font-size: 24px; }
    .header p { margin: 0; opacity: 0.9; }
    .content { background: white; padding: 20px; border: 1px solid #e0e0e0; border-top: none; }
    .section { margin: 20px 0; }
    .section h2 { font-size: 18px; margin: 0 0 15px 0; color: #333; }
    .stat-grid { display: flex; flex-wrap: wrap; gap: 15px; }
    .stat { flex: 1; min-width: 120px; padding: 15px; background: #f9f9f9; border-radius: 5px; border-left: 4px solid ${isSuccess ? '#36a64f' : '#ff0000'}; }
    .stat-value { font-size: 28px; font-weight: bold; color: ${isSuccess ? '#36a64f' : '#ff0000'}; margin-bottom: 5px; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .meta { background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 14px; color: #666; }
    .meta span { margin-right: 20px; }
    .detail-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    .detail-table th, .detail-table td { padding: 10px; text-align: left; border-bottom: 1px solid #e0e0e0; }
    .detail-table th { background: #f5f5f5; font-weight: 600; }
    .detail-table tr:hover { background: #f9f9f9; }
    .error-box { background: #ffe6e6; border-left: 4px solid #ff0000; padding: 15px; border-radius: 5px; margin-top: 15px; }
    .error-box pre { margin: 10px 0 0 0; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; }
    .footer a { color: #0366d6; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${statusEmoji} ${workflowDisplayName} - ${statusText}</h1>
      <p>GitHub Actions 工作流通知</p>
    </div>
    
    <div class="content">
      <div class="section">
        <div class="meta">
          <span>🕐 时间: ${new Date(result.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
          ${result.duration ? '<span>⏱️ 耗时: ' + result.duration + '</span>' : ''}
        </div>
      </div>
  `;

  // 统计信息
  if (result.stats) {
    html += `
      <div class="section">
        <h2>📊 执行统计</h2>
        <div class="stat-grid">
    `;

    // 动态生成统计卡片
    for (const [key, value] of Object.entries(result.stats)) {
      const labelMap: Record<string, string> = {
        'downloaded': '下载成功',
        'skipped': '跳过',
        'failed': '失败',
        'updated': '更新',
        'deleted': '删除',
        'total': '总计',
        'r18': 'R18',
        'normal': 'Normal',
      };

      const label = labelMap[key] || key;
      const displayValue = typeof value === 'object' ? value.total || JSON.stringify(value) : value;

      html += `
        <div class="stat">
          <div class="stat-value">${displayValue}</div>
          <div class="stat-label">${label}</div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
  }

  // 详细信息表格
  if (result.details && result.details.length > 0) {
    html += `
      <div class="section">
        <h2>📝 执行详情 (前 20 条)</h2>
        <table class="detail-table">
          <tr>
    `;

    // 动态生成表头（根据第一条记录的所有字段）
    const firstItem = result.details[0];
    const headers = Object.keys(firstItem);
    for (const header of headers) {
      const headerMap: Record<string, string> = {
        'filename': '文件名',
        'r2Key': 'R2 路径',
        'label': '分类',
        'size': '大小',
        'title': '标题',
        'author': '作者',
        'pid': 'PID',
        'status': '状态',
        'message': '信息',
      };
      html += `<th>${headerMap[header] || header}</th>`;
    }
    html += `</tr>`;

    // 生成表格内容（最多 20 条）
    for (const item of result.details.slice(0, 20)) {
      html += `<tr>`;
      for (const value of Object.values(item)) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value).slice(0, 50) : value;
        html += `<td>${displayValue || '-'}</td>`;
      }
      html += `</tr>`;
    }

    html += `
        </table>
        ${result.details.length > 20 ? '<p style="margin-top:10px;color:#666;">... 还有 ' + (result.details.length - 20) + ' 条记录未显示</p>' : ''}
      </div>
    `;
  }

  // 错误信息
  if (result.error || !isSuccess) {
    html += `
      <div class="section">
        <h2>⚠️ 错误信息</h2>
        <div class="error-box">
          <pre>${result.error || result.message || '未知错误'}</pre>
        </div>
      </div>
    `;
  }

  html += `
      <div class="footer">
        <p>此邮件由 <strong>Cloudflare Assets</strong> 自动发送</p>
        <p>仓库: <a href="https://github.com/songdaochuanshu/cloudflare-assets">songdaochuanshu/cloudflare-assets</a></p>
        <p>工作流: ${WORKFLOW_NAME}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

// 发送邮件
async function sendNotification(): Promise<void> {
  const result = loadWorkflowResult();
  const html = buildEmailContent(result);

  const subject = `${result.success !== false ? '✅' : '❌'} ${WORKFLOW_NAME} - ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

  const payload = {
    from: 'Cloudflare Assets <onboarding@resend.dev>',
    to: [NOTIFY_EMAIL],
    subject: subject,
    html: html,
  };

  console.log('📧 发送邮件到:', NOTIFY_EMAIL);
  console.log(' subject:', subject);
  console.log('📊 工作流:', result.workflow || WORKFLOW_NAME);
  console.log('✅ 状态:', result.success !== false ? '成功' : '失败');

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ 邮件发送失败:', resp.status, errorText);
    process.exit(1);
  }

  const result_data: any = await resp.json();
  console.log('✅ 邮件发送成功! Email ID:', result_data.id);
}

// 主函数
sendNotification().catch(err => {
  console.error('❌ 发送邮件时出错:', err);
  process.exit(1);
});
