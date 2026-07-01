// list-prefixes.ts
// 列出 R2 桶中所有前缀
import { host, emptyPayloadHash, signRequest } from '../../lib/r2-client.js';
import { logger } from '../../lib/logger.js';

async function main(): Promise<void> {
  const { authorization, amzDate } = signRequest(
    'GET',
    '/',
    'list-type=2&delimiter=/&max-keys=1000',
    emptyPayloadHash,
    new Date(),
  );
  const url = 'https://' + host + '/?list-type=2&delimiter=/&max-keys=1000';
  const resp = await fetch(url, {
    headers: {
      Authorization: authorization,
      'x-amz-content-sha256': emptyPayloadHash,
      'x-amz-date': amzDate,
      Host: host,
    },
  });
  const xml = await resp.text();

  // Extract CommonPrefixes (folders)
  const folders: string[] = [...xml.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)].map((m) => m[1] ?? '');
  // Extract root-level keys
  const keys: string[] = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1] ?? '');

  logger.info('=== 文件夹（前缀）===');
  folders.forEach((f) => logger.info('  ' + f));
  logger.info('\n=== 根目录文件 ===');
  keys.forEach((k) => logger.info('  ' + k));
  logger.info('\n文件夹数: ' + folders.length + ', 根目录文件数: ' + keys.length);
}

void main();
