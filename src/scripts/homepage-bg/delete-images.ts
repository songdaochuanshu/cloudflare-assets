// delete-images.ts
// 从 R2 删除指定的图片文件
import { readFileSync } from 'node:fs';
import { deleteObject } from '../../lib/r2-client.js';

const R2_PREFIX = 'r18/';

async function main(): Promise<void> {
  const files = readFileSync('files_to_delete.txt', 'utf8').split('\n').filter((f: string) => f.trim());
  console.log('要删除 ' + files.length + ' 个文件');
  let success = 0;
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    const filename = files[i]?.trim() ?? '';
    process.stdout.write('[' + (i + 1) + '/' + files.length + '] Deleting ' + R2_PREFIX + filename + '... ');
    try {
      const ok = await deleteObject(R2_PREFIX + filename);
      if (ok) { console.log('OK'); success++; }
      else { console.log('FAILED'); failed++; }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('ERROR: ' + msg);
      failed++;
    }
    await new Promise<void>(r => setTimeout(r, 100));
  }
  console.log('\n========== 结果 ==========');
  console.log('成功: ' + success);
  console.log('失败: ' + failed);
}

main();
