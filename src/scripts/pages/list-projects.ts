// src/scripts/pages/list-projects.ts
// 列出 Cloudflare Pages 所有项目及其关键信息
import { listPagesProjects, listDeployments } from '../../lib/cf-api.js';
import { logger } from '../../lib/logger.js';

function statusEmoji(status: string): string {
  switch (status) {
    case 'active':
    case 'ready':
    case 'live':
      return '🟢';
    case 'building':
    case 'deploying':
    case 'initializing':
      return '🟡';
    case 'error':
    case 'failure':
      return '🔴';
    case 'canceled':
      return '⚪';
    default:
      return '⚪';
  }
}

function envBadge(env: string): string {
  return env === 'production' ? '🏭' : '👁️';
}

async function main(): Promise<void> {
  logger.info('═══════════════════════════════════════════');
  logger.info('  Cloudflare Pages 项目清单');
  logger.info('═══════════════════════════════════════════\n');

  let projects;
  try {
    projects = await listPagesProjects();
  } catch (e: unknown) {
    logger.error(`❌ 无法列出 Pages 项目: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (projects.length === 0) {
    logger.info('  (暂无 Pages 项目)\n');
    logger.info('═══════════════════════════════════════════');
    return;
  }

  for (const proj of projects) {
    const src = proj.source?.config;
    const buildCmd = proj.build_config?.build_command || '(未配置)';
    const destDir = proj.build_config?.destination_dir || '(未配置)';

    logger.info(`📄 ${proj.name}`);
    logger.info(`   Subdomain: ${proj.subdomain}`);
    if (src) {
      logger.info(
        `   Source: ${src.owner}/${src.repo_name}  (production: ${src.production_branch})`,
      );
    }

    // 域名
    if (proj.domains && proj.domains.length > 0) {
      logger.info(`   自定义域名: ${proj.domains.join(', ')}`);
    }

    // 最新部署状态
    try {
      const deployments = await listDeployments(proj.name, 1);
      if (deployments.length > 0) {
        const latest = deployments[0];
        const em = statusEmoji(latest.status);
        const env = envBadge(latest.environment);
        logger.info(
          `   最新部署 ${em}${env}: ${latest.branch} @ ${latest.commit_hash.slice(0, 7)}  — ${latest.status}`,
        );
        if (latest.urls && latest.urls.length > 0) {
          logger.info(`   预览地址: ${latest.urls[0]}`);
        }
      }
    } catch {
      // 忽略单项目查询失败
    }

    logger.info(`   构建命令: ${buildCmd}`);
    logger.info(`   输出目录: ${destDir}`);
    logger.info(`   创建于: ${new Date(proj.created_on).toLocaleDateString('zh-CN')}`);
    logger.info('');
  }

  logger.info(`共 ${projects.length} 个 Pages 项目`);
  logger.info('═══════════════════════════════════════════');
}

main().catch((err: Error) => {
  logger.error(`❌ 错误: ${err.message}`);
  process.exit(1);
});
