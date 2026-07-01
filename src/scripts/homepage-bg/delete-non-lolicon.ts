// delete-non-lolicon.ts
// 根据 delete-pids.txt 中的 PID 列表，从 R2 删除对应图片
import { readFileSync } from 'node:fs';
import { bucketName, listAllKeys, deleteObject } from '../../lib/r2-client.js';
import { writeWorkflowResult, elapsed } from '../../lib/workflow-result.js';
import { logger } from '../../lib/logger.js';

const R2_PREFIX = 'r18/';

async function main(): Promise<void> {
  const startTime = Date.now();
  logger.info('=== 非 Lolicon 图片删除工具 ===');
  logger.info('Bucket: ' + bucketName);
  logger.info('');

  // 读取 PID 列表（每行一个 PID）
  const pidText = readFileSync('delete-pids.txt', 'utf8');
  const deletePids = new Set<string>(
    pidText
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0),
  );
  logger.info('要删除的图片 PID 数量: ' + deletePids.size);

  logger.info('\n获取 R2 文件列表...');
  const allKeys = await listAllKeys();
  logger.info('R2 中总文件数: ' + allKeys.length);

  const toDelete = allKeys.filter((key: string) => {
    if (!key.startsWith(R2_PREFIX)) return false;
    const filename = key.split('/').pop() ?? '';
    const pid = filename.replace(/\.[^.]+$/, '');
    return deletePids.has(pid);
  });
  logger.info('匹配到需要删除的文件: ' + toDelete.length + ' 个');

  if (toDelete.length === 0) {
    logger.info('没有需要删除的文件');
    writeWorkflowResult({
      success: true,
      workflow: 'delete-non-lolicon',
      timestamp: new Date().toISOString(),
      duration: elapsed(startTime),
      stats: { matched: 0, deleted: 0, totalR2: allKeys.length },
      details: [],
    });
    return;
  }

  logger.info('\n前 10 个文件:');
  toDelete.slice(0, 10).forEach((key: string) => logger.info('  ' + key));
  if (toDelete.length > 10) logger.info('  ... 还有 ' + (toDelete.length - 10) + ' 个');

  logger.info('\n开始删除...');
  let deleted = 0;
  let failed = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const key of toDelete) {
    process.stdout.write('删除 ' + key + '... ');
    const ok = await deleteObject(key);
    if (ok) {
      logger.info('OK');
      details.push({ key, status: '已删除' });
      deleted++;
    } else {
      logger.info('FAILED');
      details.push({ key, status: '失败' });
      failed++;
    }
    await new Promise<void>((r) => setTimeout(r, 100));
  }

  logger.info('\n========== 完成 ==========');
  logger.info('成功删除: ' + deleted + ' 个');
  logger.info('删除失败: ' + failed + ' 个');
  logger.info('R2 剩余文件: ' + (allKeys.length - deleted) + ' 个');

  writeWorkflowResult({
    success: failed === 0,
    workflow: 'delete-non-lolicon',
    timestamp: new Date().toISOString(),
    duration: elapsed(startTime),
    stats: { matched: toDelete.length, deleted, failed, totalR2: allKeys.length },
    details,
  });
}

void main();
