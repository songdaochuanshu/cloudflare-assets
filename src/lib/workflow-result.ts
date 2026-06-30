// src/lib/workflow-result.ts
// 共享的工作流结果写入工具
// 所有脚本用这个统一输出 workflow-result.json，供 email-notifier 读取

import { writeFileSync } from 'node:fs';
import { logger } from './logger';

export interface WorkflowResult {
  success: boolean;
  workflow: string;
  timestamp: string;
  duration?: string;
  stats: Record<string, number | string | Record<string, number>>;
  details: Array<Record<string, unknown>>;
  error?: string;
}

/**
 * 计算从 startTime 到现在的耗时
 */
export function elapsed(startTime: number): string {
  const ms = Date.now() - startTime;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/**
 * 写入 workflow-result.json（供 email-notifier 读取）
 */
export function writeWorkflowResult(result: WorkflowResult): void {
  writeFileSync('workflow-result.json', JSON.stringify(result, null, 2), 'utf8');
  logger.info('[workflow-result] 已写入 workflow-result.json');
}
