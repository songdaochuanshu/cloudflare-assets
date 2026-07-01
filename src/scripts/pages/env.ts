// src/scripts/pages/env.ts
// 管理 Cloudflare Pages 环境变量和 Secret
// 用法:
//   node dist/scripts/pages/env.js list <project> [production|preview]
//   node dist/scripts/pages/env.js set <project> [production|preview] KEY=VALUE [KEY=VALUE...]
//   node dist/scripts/pages/env.js delete <project> [production|preview] KEY [KEY...]
//   node dist/scripts/pages/env.js import <project> [production|preview] <envFilePath>
import { readFileSync } from 'node:fs';
import { getProjectVariables, setProjectVariables } from '../../lib/cf-api.js';
import { logger } from '../../lib/logger.js';

type Action = 'list' | 'set' | 'delete' | 'import';
type Env = 'production' | 'preview';

const [, , rawAction, rawProject, rawEnvOrFirstKey, ...rest] = process.argv;

function parseEnv(raw: string | undefined): Env {
  if (raw === 'preview') return 'preview';
  return 'production';
}

function parseKeyValues(args: string[]): Array<{ name: string; value: string; type?: string }> {
  return args.map((pair) => {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) return { name: pair, value: '', type: 'secret_text' as const };
    const name = pair.slice(0, eqIdx);
    const rawValue = pair.slice(eqIdx + 1);
    // 识别以 @file: 开头的值 → 从文件读取
    let value = rawValue;
    if (rawValue.startsWith('@file:')) {
      const filePath = rawValue.slice(6);
      try {
        value = readFileSync(filePath, 'utf8').trim();
      } catch {
        logger.warn(`  ⚠️  无法读取文件 ${filePath}，使用原始值`);
      }
    }
    // 识别数字
    const type = /^-?\d+(\.\d+)?$/.test(value) ? 'number' : undefined;
    return { name, value, type };
  });
}

async function loadEnvFile(
  filePath: string,
): Promise<Array<{ name: string; value: string; type?: string }>> {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter((l) => !l.startsWith('#') && l.includes('='));
  return lines.map((line) => {
    const eqIdx = line.indexOf('=');
    const name = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // 去掉首尾引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const type = /^-?\d+(\.\d+)?$/.test(value) ? 'number' : undefined;
    return { name, value, type };
  });
}

async function listVars(project: string, env: Env): Promise<void> {
  const vars = await getProjectVariables(project, env);
  const envLabel = env === 'production' ? '🏭 生产环境' : '👁️ 预览环境';
  logger.info(`\n${envLabel} — ${project} (${vars.length} 个变量)\n`);
  if (vars.length === 0) {
    logger.info('  (空)');
    return;
  }
  const maxLen = Math.max(...vars.map((v) => v.name.length));
  for (const v of vars) {
    const masked = v.type === 'secret_text' ? '••••••••' : v.value;
    logger.info(`  ${v.name.padEnd(maxLen + 2)} ${v.type.padEnd(12)} ${masked}`);
  }
}

async function setVars(
  project: string,
  env: Env,
  items: Array<{ name: string; value: string; type?: string }>,
): Promise<void> {
  logger.info(`\n设置 ${items.length} 个变量 (${project} / ${env}):\n`);
  const result = await setProjectVariables(project, env, items);
  for (const v of result) {
    const tag = v.type === 'secret_text' ? '🔒' : '📝';
    logger.info(`  ${tag} ${v.name} = ${v.type === 'secret_text' ? '••••••••' : v.value}`);
  }
  logger.info(`\n✅ 成功写入 ${result.length} 个变量`);
}

async function deleteVars(project: string, env: Env, keys: string[]): Promise<void> {
  logger.info(`\n删除变量 (${project} / ${env}): ${keys.join(', ')}`);
  // Cloudflare 不支持单独删除，通过 PUT 设置空值来模拟删除
  const existing = await getProjectVariables(project, env);
  const filtered = existing.filter((v) => !keys.includes(v.name));
  await setProjectVariables(
    project,
    env,
    filtered.map((v) => ({ name: v.name, value: v.value, type: v.type })),
  );
  for (const k of keys) {
    logger.info(`  🗑️  已删除: ${k}`);
  }
  logger.info('\n✅ 删除完成');
}

async function importFromFile(project: string, env: Env, filePath: string): Promise<void> {
  const items = await loadEnvFile(filePath);
  logger.info(`\n从 ${filePath} 导入 ${items.length} 个变量到 ${project} / ${env}`);
  await setVars(project, env, items);
}

async function main(): Promise<void> {
  const action = rawAction as Action | undefined;
  const project = rawProject;
  const env = parseEnv(rawEnvOrFirstKey);

  if (!action || !project) {
    logger.error('用法:');
    logger.error('  node dist/scripts/pages/env.js list <project> [production|preview]');
    logger.error(
      '  node dist/scripts/pages/env.js set <project> [production|preview] KEY=VALUE [KEY=VALUE...]',
    );
    logger.error(
      '  node dist/scripts/pages/env.js delete <project> [production|preview] KEY [KEY...]',
    );
    logger.error(
      '  node dist/scripts/pages/env.js import <project> [production|preview] <.env文件路径>',
    );
    process.exit(1);
  }

  try {
    switch (action) {
      case 'list': {
        await listVars(project, env);
        break;
      }
      case 'set': {
        if (rest.length === 0) {
          logger.error('❌ set 需要至少一个 KEY=VALUE 参数');
          process.exit(1);
        }
        await setVars(project, env, parseKeyValues(rest));
        break;
      }
      case 'delete': {
        if (rest.length === 0) {
          logger.error('❌ delete 需要至少一个 KEY 参数');
          process.exit(1);
        }
        await deleteVars(project, env, rest);
        break;
      }
      case 'import': {
        const filePath = rawEnvOrFirstKey;
        if (!filePath || rawEnvOrFirstKey === 'production' || rawEnvOrFirstKey === 'preview') {
          logger.error('❌ import 需要 .env 文件路径');
          process.exit(1);
        }
        await importFromFile(project, env, filePath);
        break;
      }
      default: {
        logger.error(`❌ 未知操作: ${action}`);
        process.exit(1);
      }
    }
  } catch (err: unknown) {
    logger.error(`❌ 错误: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err: Error) => {
  logger.error(`❌ 未捕获错误: ${err.message}`);
  process.exit(1);
});
