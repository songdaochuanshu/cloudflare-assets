// delete-non-lolicon.ts
// 根据 delete-pids.txt 中的 PID 列表，从 R2 删除对应图片
import { readFileSync } from 'node:fs';
import { bucketName, listAllKeys, deleteObject } from '../../r2/r2-client.js';

const R2_PREFIX = 'r18/';

async function main(): Promise<void> {
  console.log('=== 非 Lolicon 图片删除工具 ===');
  console.log('Bucket: ' + bucketName);
  console.log('');

  // 读取 PID 列表（每行一个 PID）
  const pidText = readFileSync('delete-pids.txt', 'utf8');
  const deletePids = new Set<string>(
    pidText.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0)
  );
  console.log('要删除的图片 PID 数量: ' + deletePids.size);

  console.log('\n获取 R2 文件列表...');
  const allKeys = await listAllKeys();
  console.log('R2 中总文件数: ' + allKeys.length);

  const toDelete = allKeys.filter((key: string) => {
    if (!key.startsWith(R2_PREFIX)) return false;
    const filename = key.split('/').pop() ?? '';
    const pid = filename.replace(/\.[^.]+$/, '');
    return deletePids.has(pid);
  });
  console.log('匹配到需要删除的文件: ' + toDelete.length + ' 个');

  if (toDelete.length === 0) {
    console.log('没有需要删除的文件');
    return;
  }

  console.log('\n前 10 个文件:');
  toDelete.slice(0, 10).forEach((key: string) => console.log('  ' + key));
  if (toDelete.length > 10) console.log('  ... 还有 ' + (toDelete.length - 10) + ' 个');

  console.log('\n开始删除...');
  let deleted = 0;
  let failed = 0;

  for (const key of toDelete) {
    process.stdout.write('删除 ' + key + '... ');
    const ok = await deleteObject(key);
    if (ok) {
      console.log('OK');
      deleted++;
    } else {
      console.log('FAILED');
      failed++;
    }
    await new Promise<void>(r => setTimeout(r, 100));
  }

  console.log('\n========== 完成 ==========');
  console.log('成功删除: ' + deleted + ' 个');
  console.log('删除失败: ' + failed + ' 个');
  console.log('R2 剩余文件: ' + (allKeys.length - deleted) + ' 个');
}

main();
