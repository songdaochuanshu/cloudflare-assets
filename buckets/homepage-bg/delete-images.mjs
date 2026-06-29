// delete-images.mjs
// 从 R2 删除指定的图片文件
import { readFileSync } from 'fs';
import { bucketName, deleteObject } from '../../r2/r2-client.mjs';

const R2_PREFIX = 'r18/';

async function main() {
  const files = readFileSync('files_to_delete.txt', 'utf8').split('\n').filter(f => f.trim());
  console.log('要删除 ' + files.length + ' 个文件');
  let success = 0;
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    const filename = files[i].trim();
    process.stdout.write('[' + (i + 1) + '/' + files.length + '] Deleting ' + R2_PREFIX + filename + '... ');
    try {
      const ok = await deleteObject(R2_PREFIX + filename);
      if (ok) { console.log('OK'); success++; }
      else { console.log('FAILED'); failed++; }
    } catch (e) { console.log('ERROR: ' + e.message); failed++; }
    await new Promise(r => setTimeout(r, 100));
  }
  console.log('\n========== 结果 ==========');
  console.log('成功: ' + success);
  console.log('失败: ' + failed);
}

main();
