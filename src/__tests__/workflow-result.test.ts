import { vi, describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.hoisted(() => {
  process.env.R2_ACCOUNT_ID = 'acc';
  process.env.R2_KEY_ID = 'kid';
  process.env.R2_SECRET_KEY = 'sec';
});

import { elapsed, writeWorkflowResult, type WorkflowResult } from '../lib/workflow-result.js';

describe('workflow-result', () => {
  let cwd = process.cwd();

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-res-'));
    cwd = dir;
    process.chdir(dir);
  });

  it('writeWorkflowResult 写入文件', () => {
    const result: WorkflowResult = {
      success: true,
      workflow: 'unit-test',
      timestamp: '2026-07-01T00:00:00Z',
      stats: { count: 1 },
      details: [{ k: 'v' }],
    };
    writeWorkflowResult(result);
    const file = join(cwd, 'workflow-result.json');
    expect(existsSync(file)).toBe(true);
    const json = JSON.parse(readFileSync(file, 'utf8'));
    expect(json.success).toBe(true);
    expect(json.workflow).toBe('unit-test');
    expect(json.stats).toEqual({ count: 1 });
    expect(json.details).toEqual([{ k: 'v' }]);
    rmSync(file);
  });

  it('elapsed 小于 60s 时返回秒', () => {
    const start = Date.now() - 5000;
    expect(elapsed(start)).toMatch(/^\d+s$/);
  });

  it('elapsed 超过 60s 时返回分秒', () => {
    const start = Date.now() - 65_000;
    expect(elapsed(start)).toMatch(/^\d+m \d+s$/);
  });
});
