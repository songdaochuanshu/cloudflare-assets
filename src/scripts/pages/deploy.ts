// src/scripts/pages/deploy.ts
// 触发 Cloudflare Pages 部署
// 用法: node dist/scripts/pages/deploy.js <projectName> [branch]
// 示例: node dist/scripts/pages/deploy.js my-site main
import { triggerDeployment, getDeployment, cancelDeployment } from '../../lib/cf-api.js';
import { writeWorkflowResult, elapsed } from '../../lib/workflow-result.js';
import { logger } from '../../lib/logger.js';

const [, , rawProject, rawBranch] = process.argv;

if (!rawProject) {
  console.error('用法: node dist/scripts/pages/deploy.js <projectName> [branch] [--cancel <deploymentId>]');
  process.exit(1);
}

const projectName = rawProject;
const branch = rawBranch && rawBranch !== '--cancel' ? rawBranch : undefined;
const cancelMode = process.argv.includes('--cancel');
const cancelDeploymentId = cancelMode ? process.argv[process.argv.indexOf('--cancel') + 1] : undefined;

async function pollDeployment(pid: string, depId: string, timeoutMs = 300_000): Promise<void> {
  const start = Date.now();
  const intervals = [10_000, 15_000, 20_000];

  while (Date.now() - start < timeoutMs) {
    const dep = await getDeployment(pid, depId);
    const age = Math.round((Date.now() - start) / 1000);
    if (dep.status === 'ready') {
      logger.info(`✅ 部署成功！(${age}s) — ${dep.urls?.[0] ?? dep.id}`);
      return;
    }
    if (dep.status === 'error' || dep.status === 'failure' || dep.status === 'canceled') {
      throw new Error(`部署失败: ${dep.status}`);
    }

    const wait = intervals[Math.min(intervals.length - 1, Math.floor(age / 30))];
    logger.info(`⏳ 部署中... (${age}s) 状态: ${dep.status}，${Math.round(wait / 1000)}s 后刷新`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`轮询超时（${Math.round(timeoutMs / 1000)}s）`);
}

async function main(): Promise<void> {
  const startTime = Date.now();

  if (cancelMode && cancelDeploymentId) {
    logger.info(`🛑 取消部署 ${cancelDeploymentId}（项目: ${projectName}）`);
    await cancelDeployment(projectName, cancelDeploymentId);
    logger.info('✅ 取消请求已发送');
    writeWorkflowResult({
      success: true,
      workflow: 'pages-deploy',
      timestamp: new Date().toISOString(),
      duration: elapsed(startTime),
      stats: { action: 'cancel', deploymentId: cancelDeploymentId },
      details: [],
    });
    return;
  }

  logger.info(`🚀 触发 Pages 部署: ${projectName}${branch ? ` (分支: ${branch})` : ''}`);
  const deployment = await triggerDeployment(projectName, branch);
  logger.info(`📋 部署 ID: ${deployment.id}`);
  logger.info(`   短 ID: ${deployment.short_id}`);
  logger.info(`   分支: ${deployment.branch}`);
  logger.info(`   Commit: ${deployment.commit_hash.slice(0, 7)}`);
  logger.info(`   状态: ${deployment.status}`);

  if (deployment.status === 'ready') {
    logger.info(`✅ 部署已完成 — ${deployment.urls?.[0] ?? ''}`);
    writeWorkflowResult({
      success: true,
      workflow: 'pages-deploy',
      timestamp: new Date().toISOString(),
      duration: elapsed(startTime),
      stats: {
        projectName,
        deploymentId: deployment.id,
        shortId: deployment.short_id,
        branch: deployment.branch,
        commit: deployment.commit_hash.slice(0, 7),
        status: deployment.status,
        url: deployment.urls?.[0] ?? '',
      },
      details: [],
    });
    return;
  }

  if (deployment.status === 'building' || deployment.status === 'deploying') {
    logger.info('⏳ 构建已开始，轮询状态...');
    try {
      await pollDeployment(projectName, deployment.id);
      writeWorkflowResult({
        success: true,
        workflow: 'pages-deploy',
        timestamp: new Date().toISOString(),
        duration: elapsed(startTime),
        stats: {
          projectName,
          deploymentId: deployment.id,
          shortId: deployment.short_id,
          branch: deployment.branch,
          commit: deployment.commit_hash.slice(0, 7),
          status: 'ready',
          url: deployment.urls?.[0] ?? '',
        },
        details: [],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      writeWorkflowResult({
        success: false,
        workflow: 'pages-deploy',
        timestamp: new Date().toISOString(),
        duration: elapsed(startTime),
        stats: {
          projectName,
          deploymentId: deployment.id,
          status: 'failed',
        },
        details: [],
        error: msg,
      });
      logger.error(`❌ ${msg}`);
      process.exit(1);
    }
  } else {
    logger.warn(`⚠️  部署状态异常: ${deployment.status}`);
    writeWorkflowResult({
      success: false,
      workflow: 'pages-deploy',
      timestamp: new Date().toISOString(),
      duration: elapsed(startTime),
      stats: {
        projectName,
        deploymentId: deployment.id,
        status: deployment.status,
      },
      details: [],
      error: `部署状态异常: ${deployment.status}`,
    });
    process.exit(1);
  }
}

main().catch((err: Error) => {
  writeWorkflowResult({
    success: false,
    workflow: 'pages-deploy',
    timestamp: new Date().toISOString(),
    duration: elapsed(Date.now()),
    stats: { projectName },
    details: [],
    error: err.message,
  });
  logger.error(`❌ 错误: ${err.message}`);
  process.exit(1);
});
