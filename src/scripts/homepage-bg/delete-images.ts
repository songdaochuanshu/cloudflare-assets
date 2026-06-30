// delete-images.ts
// 从 R2 删除指定的图片文件
import { readFileSync } from 'node:fs';
import { deleteObject } from '../../lib/r2-client.js';
import { writeWorkflowResult, elapsed } from '../../lib/workflow-result.js';

const R2_PREFIX = 'r18/';

async function main(): Promise<void> {
  const startTime = Date.now();
  const files = readFileSync('files_to_delete.txt', 'utf8').split('\n').filter((f: string) => f.trim());
  console.log('要删除 ' + files.length + ' 个文件');
  let success = 0;
  let failed = 0;
  const details: Array<Record<string, unknown>> = [];

  for (let i = 0; i < files.length; i++) {
    const filename = files[i]?.trim() ?? '';
    const key = R2_PREFIX + filename;
    process.stdout.write('[' + (i + 1) + '/' + files.length + '] Deleting ' + key + '... ');
    try {
      const ok = await deleteObject(key);
      if (ok) {
        console.log('OK');
        details.push({ filename, key, status: '已删除' });
        success++;
      } else {
        console.log('FAILED');
        details.push({ filename, key, status: '失败' });
        failed++;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('ERROR: ' + msg);
      details.push({ filename, key, status: '错误', error: msg });
      failed++;
    }
    await new Promise<void>(r => setTimeout(r, 100));
  }

  console.log('\n========== 结果 ==========');
  console.log('成功: ' + success);
  console.log('失败: ' + failed);

  writeWorkflowResult({
    success: failed === 0,
    workflow: 'delete-images',
    timestamp: new Date().toISOString(),
    duration: elapsed(startTime),
    stats: { deleted: success, failed, total: files.length },
    details,
  });
}

main();
