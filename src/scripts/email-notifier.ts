// email-notifier.ts
// 通用邮件通知组件 — v2 现代风格模板
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

function loadWorkflowResult(): WorkflowResult {
  const possibleFiles = [
    './workflow-result.json',
    './crawl-summary.json',
    './update-summary.json',
    './delete-summary.json',
  ];
  for (const file of possibleFiles) {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch { /* next */ }
  }
  return {
    success: WORKFLOW_STATUS === 'success',
    workflow: WORKFLOW_NAME,
    timestamp: new Date().toISOString(),
    error: '无法读取工作流结果文件',
  };
}

const WORKFLOW_NAMES: Record<string, string> = {
  'crawl-lolicon': 'Lolicon 图片爬虫',
  'update-images-info': '图片元数据更新',
  'delete-images': '图片删除任务',
  'delete-non-lolicon': '非 Lolicon 图片删除',
  'check-lolicon': '图片来源检查',
  'cleanup-blog': '博客清空',
  'crawl-cnblogs': '博客园文章爬取',
  'crawl-cnblogs-clean': '博客文章清理',
  'crawl-cnblogs-fix-manifest': 'Manifest 修复',
  'generate-article': 'AI 文章生成',
  'fix-manifest-tags': '文章标签修复',
  'delete-all-posts': '删除所有文章',
  'delete-first-posts': '删除前 N 篇文章',
  'delete-old-posts': '删除旧文章',
  'list-prefixes': 'R2 前缀列表',
  'enrich-metadata': '图片元数据补全',
  'fix-images-info-structure': 'images-info 结构修复',
  'list-domains': 'CDN 域名列表',
  'sync-domains': 'CDN 域名同步',
};

const STAT_LABELS: Record<string, string> = {
  downloaded: '下载成功', skipped: '跳过', failed: '失败',
  updated: '更新', deleted: '删除', total: '总计',
  r18: 'R18', normal: 'Normal', fixed: '修复', kept: '保留',
  matched: '匹配', manifest: 'Manifest', existing: '已有', new: '新增',
  totalR2: 'R2 总文件', uploaded: '已上传', wordCount: '字数',
  readabilityScore: '可读性', avgParagraphLen: '平均段落长',
};

const HEADER_LABELS: Record<string, string> = {
  filename: '文件名', r2Key: 'R2 路径', label: '分类', size: '大小',
  title: '标题', author: '作者', pid: 'PID', status: '状态',
  message: '信息', key: 'Key', category: '分类', tags: '标签',
  topic: '主题', error: '错误',
};

function buildEmailContent(result: WorkflowResult): string {
  const ok = result.success !== false;
  const accent = ok ? '#059669' : '#dc2626';
  const accentBg = ok ? '#ecfdf5' : '#fef2f2';
  const accentBorder = ok ? '#a7f3d0' : '#fecaca';
  const name = WORKFLOW_NAMES[result.workflow || WORKFLOW_NAME] || result.workflow || WORKFLOW_NAME;
  const statusLabel = ok ? '执行成功' : '执行失败';
  const statusIcon = ok ? '✓' : '✕';
  const ts = new Date(result.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ── stats cards ──
  let statsHtml = '';
  if (result.stats && Object.keys(result.stats).length > 0) {
    const entries = Object.entries(result.stats).filter(([, v]) => typeof v !== 'object');
    if (entries.length > 0) {
      const cards = entries.map(([k, v]) => `
        <td style="padding:0;vertical-align:top;width:${Math.floor(100 / Math.min(entries.length, 4))}%">
          <div style="background:#f9fafb;border-radius:8px;padding:14px 12px;text-align:center;border:1px solid #f3f4f6">
            <div style="font-size:26px;font-weight:700;color:${accent};line-height:1.1">${v}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">${STAT_LABELS[k] || k}</div>
          </div>
        </td>`).join('');
      statsHtml = `
        <tr><td style="padding:24px 32px 0">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing:0 8px"><tr>${cards}</tr></table>
        </td></tr>`;
    }
  }

  // ── details table ──
  let detailsHtml = '';
  if (result.details && result.details.length > 0) {
    const headers = Object.keys(result.details[0]);
    const ths = headers.map(h =>
      `<th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:2px solid #e5e7eb;white-space:nowrap">${HEADER_LABELS[h] || h}</th>`
    ).join('');
    const rows = result.details.slice(0, 15).map(item => {
      const tds = headers.map(h => {
        let v = item[h];
        if (Array.isArray(v)) v = v.join(', ');
        if (typeof v === 'object' && v !== null) v = JSON.stringify(v).slice(0, 40);
        return `<td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v ?? '—'}</td>`;
      }).join('');
      return `<tr style="background:white">${tds}</tr>`;
    }).join('');
    const more = result.details.length > 15
      ? `<tr><td colspan="${headers.length}" style="padding:10px 14px;font-size:12px;color:#9ca3af;text-align:center">还有 ${result.details.length - 15} 条未显示</td></tr>`
      : '';
    detailsHtml = `
        <tr><td style="padding:24px 32px 0">
          <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:10px">📋 执行详情</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
            <thead style="background:#f9fafb"><tr>${ths}</tr></thead>
            <tbody>${rows}${more}</tbody>
          </table>
        </td></tr>`;
  }

  // ── error box ──
  let errorHtml = '';
  if (result.error) {
    errorHtml = `
        <tr><td style="padding:24px 32px 0">
          <div style="background:${accentBg};border:1px solid ${accentBorder};border-radius:8px;padding:16px">
            <div style="font-size:13px;font-weight:600;color:${accent};margin-bottom:8px">⚠️ 错误信息</div>
            <pre style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monospace;font-size:12px;color:#374151;white-space:pre-wrap;word-break:break-all;line-height:1.5">${result.error}</pre>
          </div>
        </td></tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

    <!-- header -->
    <tr><td style="background:${accent};padding:28px 32px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle">
          <div style="font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px">Cloudflare Assets</div>
          <div style="font-size:22px;font-weight:700;color:white;line-height:1.3">${name}</div>
        </td>
        <td align="right" style="vertical-align:middle">
          <div style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:20px;padding:6px 16px">
            <span style="font-size:14px;font-weight:600;color:white">${statusIcon} ${statusLabel}</span>
          </div>
        </td>
      </tr></table>
    </td></tr>

    <!-- meta bar -->
    <tr><td style="padding:16px 32px;background:#f9fafb;border-bottom:1px solid #f3f4f6">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:13px;color:#6b7280">🕐 ${ts}</td>
        ${result.duration ? `<td align="right" style="font-size:13px;color:#6b7280">⏱️ ${result.duration}</td>` : ''}
      </tr></table>
    </td></tr>

    ${statsHtml}
    ${detailsHtml}
    ${errorHtml}

    <!-- padding bottom -->
    <tr><td style="padding:24px 0 0"></td></tr>

    <!-- footer -->
    <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;color:#9ca3af">
          此邮件由 Cloudflare Assets 自动发送 ·
          <a href="https://github.com/songdaochuanshu/cloudflare-assets" style="color:#6b7280;text-decoration:underline">GitHub</a>
        </td>
        <td align="right" style="font-size:11px;color:#9ca3af">${WORKFLOW_NAME}</td>
      </tr></table>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}

async function sendNotification(): Promise<void> {
  const result = loadWorkflowResult();
  const html = buildEmailContent(result);
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const subject = `${result.success !== false ? '✅' : '❌'} ${WORKFLOW_NAMES[result.workflow || WORKFLOW_NAME] || WORKFLOW_NAME} · ${ts}`;

  console.log('📧 发送邮件到:', NOTIFY_EMAIL);
  console.log('   主题:', subject);
  console.log('   工作流:', result.workflow || WORKFLOW_NAME);
  console.log('   状态:', result.success !== false ? '成功' : '失败');

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Cloudflare Assets <onboarding@resend.dev>',
      to: [NOTIFY_EMAIL],
      subject,
      html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('❌ 邮件发送失败:', resp.status, errText);
    process.exit(1);
  }

  const data: any = await resp.json();
  console.log('✅ 邮件发送成功! ID:', data.id);
}

sendNotification().catch(err => {
  console.error('❌ 发送邮件时出错:', err);
  process.exit(1);
});
