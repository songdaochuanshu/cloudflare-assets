// src/scripts/cdn/sync-domains.ts
// 根据 cdn/domains.json 配置，同步 Cloudflare R2 / Pages / Workers 自定义域名
import { readFileSync } from 'node:fs';
import {
  listR2Domains,
  addR2Domain,
  removeR2Domain,
  listPagesDomains,
  addPagesDomain,
  removePagesDomain,
  listWorkerRoutes,
  createWorkerRoute,
  deleteWorkerRoute,
  listWorkerDomains,
  addWorkerDomain,
  removeWorkerDomain,
  findZoneId,
} from '../../lib/cf-api.js';
import { writeWorkflowResult, elapsed } from '../../lib/workflow-result.js';
import { logger } from '../../lib/logger.js';

interface DomainsConfig {
  r2?: Record<string, { domains: string[] }>;
  pages?: Record<string, { domains: string[] }>;
  workers?: {
    routes?: { pattern: string; worker: string }[];
    domains?: Record<string, string[]>;
  };
}

function loadConfig(): DomainsConfig {
  const raw = readFileSync('cdn/domains.json', 'utf8');
  return JSON.parse(raw) as DomainsConfig;
}

async function syncR2(
  config: DomainsConfig,
): Promise<{ added: string[]; removed: string[]; kept: string[]; errors: string[] }> {
  const added: string[] = [];
  const removed: string[] = [];
  const kept: string[] = [];
  const errors: string[] = [];

  for (const [bucket, cfg] of Object.entries(config.r2 ?? {})) {
    const desired = new Set(cfg.domains);
    let current: { domain: string }[];
    try {
      current = await listR2Domains(bucket);
    } catch (e: unknown) {
      errors.push(`R2/${bucket}: 列出域名失败 — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const currentSet = new Set(current.map((d) => d.domain));

    // 添加缺失的
    for (const domain of desired) {
      if (currentSet.has(domain)) {
        kept.push(`R2/${bucket}: ${domain}`);
        continue;
      }
      try {
        const zoneId = await findZoneId(domain);
        await addR2Domain(bucket, domain, zoneId ?? undefined);
        added.push(`R2/${bucket}: ${domain}`);
        logger.info(`  ✅ 已添加 R2/${bucket}: ${domain}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`R2/${bucket}: 添加 ${domain} 失败 — ${msg}`);
        logger.info(`  ❌ R2/${bucket}: 添加 ${domain} 失败 — ${msg}`);
      }
    }

    // 删除多余的
    for (const d of current) {
      if (desired.has(d.domain)) continue;
      try {
        await removeR2Domain(bucket, d.domain);
        removed.push(`R2/${bucket}: ${d.domain}`);
        logger.info(`  🗑️  已删除 R2/${bucket}: ${d.domain}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`R2/${bucket}: 删除 ${d.domain} 失败 — ${msg}`);
        logger.info(`  ❌ R2/${bucket}: 删除 ${d.domain} 失败 — ${msg}`);
      }
    }
  }

  return { added, removed, kept, errors };
}

async function syncPages(
  config: DomainsConfig,
): Promise<{ added: string[]; removed: string[]; kept: string[]; errors: string[] }> {
  const added: string[] = [];
  const removed: string[] = [];
  const kept: string[] = [];
  const errors: string[] = [];

  for (const [project, cfg] of Object.entries(config.pages ?? {})) {
    const desired = new Set(cfg.domains);
    let current: { name: string }[];
    try {
      current = await listPagesDomains(project);
    } catch (e: unknown) {
      errors.push(`Pages/${project}: 列出域名失败 — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const currentSet = new Set(current.map((d) => d.name));

    for (const domain of desired) {
      if (currentSet.has(domain)) {
        kept.push(`Pages/${project}: ${domain}`);
        continue;
      }
      try {
        await addPagesDomain(project, domain);
        added.push(`Pages/${project}: ${domain}`);
        logger.info(`  ✅ 已添加 Pages/${project}: ${domain}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Pages/${project}: 添加 ${domain} 失败 — ${msg}`);
        logger.info(`  ❌ Pages/${project}: 添加 ${domain} 失败 — ${msg}`);
      }
    }

    for (const d of current) {
      if (desired.has(d.name)) continue;
      try {
        await removePagesDomain(project, d.name);
        removed.push(`Pages/${project}: ${d.name}`);
        logger.info(`  🗑️  已删除 Pages/${project}: ${d.name}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Pages/${project}: 删除 ${d.name} 失败 — ${msg}`);
        logger.info(`  ❌ Pages/${project}: 删除 ${d.name} 失败 — ${msg}`);
      }
    }
  }

  return { added, removed, kept, errors };
}

async function syncWorkerRoutes(
  config: DomainsConfig,
): Promise<{ added: string[]; removed: string[]; kept: string[]; errors: string[] }> {
  const added: string[] = [];
  const removed: string[] = [];
  const kept: string[] = [];
  const errors: string[] = [];

  const desiredRoutes = config.workers?.routes ?? [];
  if (desiredRoutes.length === 0 && !config.workers?.routes)
    return { added, removed, kept, errors };

  let current: { id: string; pattern: string; script: string }[];
  try {
    current = await listWorkerRoutes();
  } catch (e: unknown) {
    errors.push(`Workers: 列出路由失败 — ${e instanceof Error ? e.message : String(e)}`);
    return { added, removed, kept, errors };
  }

  const desiredPatterns = new Set(desiredRoutes.map((r) => r.pattern));
  const currentPatterns = new Map(current.map((r) => [r.pattern, r]));

  for (const route of desiredRoutes) {
    const existing = currentPatterns.get(route.pattern);
    if (existing && existing.script === route.worker) {
      kept.push(`Workers 路由: ${route.pattern} → ${route.worker}`);
      continue;
    }
    try {
      if (existing) await deleteWorkerRoute(existing.id);
      await createWorkerRoute(route.pattern, route.worker);
      added.push(`Workers 路由: ${route.pattern} → ${route.worker}`);
      logger.info(`  ✅ 已添加 Workers 路由: ${route.pattern} → ${route.worker}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Workers 路由: ${route.pattern} 失败 — ${msg}`);
      logger.info(`  ❌ Workers 路由: ${route.pattern} 失败 — ${msg}`);
    }
  }

  for (const r of current) {
    if (desiredPatterns.has(r.pattern)) continue;
    // 只删除配置文件中提到的 workers 路由（避免删掉用户手动创建的）
    // 这里不做自动删除，只提示
    logger.info(`  ⚠️  现有路由未在配置中: ${r.pattern} → ${r.script}（跳过）`);
  }

  return { added, removed, kept, errors };
}

async function syncWorkerDomains(
  config: DomainsConfig,
): Promise<{ added: string[]; removed: string[]; kept: string[]; errors: string[] }> {
  const added: string[] = [];
  const removed: string[] = [];
  const kept: string[] = [];
  const errors: string[] = [];

  const desired = config.workers?.domains ?? {};
  if (Object.keys(desired).length === 0 && !config.workers?.domains)
    return { added, removed, kept, errors };

  let current: { id: string; hostname: string; service: string }[];
  try {
    current = await listWorkerDomains();
  } catch (e: unknown) {
    errors.push(`Workers: 列出域名失败 — ${e instanceof Error ? e.message : String(e)}`);
    return { added, removed, kept, errors };
  }

  const currentMap = new Map(current.map((d) => [d.hostname, d]));
  const allDesiredHostnames = new Set(Object.values(desired).flat());

  for (const [service, hostnames] of Object.entries(desired)) {
    for (const hostname of hostnames) {
      const existing = currentMap.get(hostname);
      if (existing && existing.service === service) {
        kept.push(`Workers 域名: ${hostname} → ${service}`);
        continue;
      }
      try {
        const zoneId = await findZoneId(hostname);
        if (!zoneId) {
          errors.push(`Workers 域名: ${hostname} — 找不到对应 Zone`);
          continue;
        }
        if (existing) await removeWorkerDomain(existing.id);
        await addWorkerDomain(hostname, service, zoneId);
        added.push(`Workers 域名: ${hostname} → ${service}`);
        logger.info(`  ✅ 已添加 Workers 域名: ${hostname} → ${service}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Workers 域名: ${hostname} 失败 — ${msg}`);
        logger.info(`  ❌ Workers 域名: ${hostname} 失败 — ${msg}`);
      }
    }
  }

  for (const d of current) {
    if (allDesiredHostnames.has(d.hostname)) continue;
    logger.info(`  ⚠️  现有域名未在配置中: ${d.hostname} → ${d.service}（跳过）`);
  }

  return { added, removed, kept, errors };
}

async function main(): Promise<void> {
  const startTime = Date.now();
  const config = loadConfig();

  logger.info('═══════════════════════════════════════════');
  logger.info('  Cloudflare 自定义域名同步');
  logger.info('═══════════════════════════════════════════\n');

  logger.info('📦 R2 自定义域名');
  const r2 = await syncR2(config);
  logger.info('');

  logger.info('📄 Pages 自定义域名');
  const pages = await syncPages(config);
  logger.info('');

  logger.info('⚡ Workers 路由');
  const routes = await syncWorkerRoutes(config);
  logger.info('');

  logger.info('⚡ Workers 自定义域名');
  const workerDomains = await syncWorkerDomains(config);
  logger.info('');

  // 汇总
  const allAdded = [...r2.added, ...pages.added, ...routes.added, ...workerDomains.added];
  const allRemoved = [...r2.removed, ...pages.removed, ...routes.removed, ...workerDomains.removed];
  const allKept = [...r2.kept, ...pages.kept, ...routes.kept, ...workerDomains.kept];
  const allErrors = [...r2.errors, ...pages.errors, ...routes.errors, ...workerDomains.errors];

  logger.info('═══════════════════════════════════════════');
  logger.info(
    `  ✅ 添加: ${allAdded.length}  🗑️  删除: ${allRemoved.length}  ⏭️  保持: ${allKept.length}  ❌ 错误: ${allErrors.length}`,
  );
  logger.info('═══════════════════════════════════════════');

  writeWorkflowResult({
    success: allErrors.length === 0,
    workflow: 'sync-domains',
    timestamp: new Date().toISOString(),
    duration: elapsed(startTime),
    stats: {
      added: allAdded.length,
      removed: allRemoved.length,
      kept: allKept.length,
      errors: allErrors.length,
    },
    details: [
      ...allAdded.map((d) => ({ action: '添加', domain: d, status: '成功' })),
      ...allRemoved.map((d) => ({ action: '删除', domain: d, status: '成功' })),
      ...allErrors.map((d) => ({ action: '错误', domain: d, status: '失败' })),
    ],
  });
}

main().catch((err: Error) => {
  writeWorkflowResult({
    success: false,
    workflow: 'sync-domains',
    timestamp: new Date().toISOString(),
    stats: {},
    details: [],
    error: err.message,
  });
  logger.error(`❌ 错误:${err.message}`);
  process.exit(1);
});
