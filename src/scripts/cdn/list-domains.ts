// src/scripts/cdn/list-domains.ts
// 列出 Cloudflare R2 / Pages / Workers 的所有自定义域名
import {
  listR2Domains,
  listPagesDomains,
  listWorkerRoutes,
  listWorkerDomains,
  listZones,
} from '../../lib/cf-api.js';
// Type imports kept for documentation// import type { R2CustomDomain, PagesDomain, WorkerRoute, WorkerDomain, Zone } from '../../lib/cf-api.js';
import { readFileSync } from 'node:fs';
import { logger } from '../../lib/logger.js';

interface DomainsConfig {
  r2?: Record<string, { domains: string[] }>;
  pages?: Record<string, { domains: string[] }>;
  workers?: { routes?: { pattern: string; worker: string }[]; domains?: Record<string, string[]> };
}

function loadConfig(): DomainsConfig {
  try {
    return JSON.parse(readFileSync('cdn/domains.json', 'utf8'));
  } catch {
    return {};
  }
}

function domainStatusEmoji(status: string): string {
  switch (status) {
    case 'active':
    case 'live':
      return '🟢';
    case 'initializing':
    case 'pending':
    case 'validating':
      return '🟡';
    case 'error':
    case 'failed':
      return '🔴';
    default:
      return '⚪';
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const zones = await listZones();
  const zoneMap = new Map(zones.map((z) => [z.id, z.name]));

  logger.info('═══════════════════════════════════════════');
  logger.info('  Cloudflare 自定义域名清单');
  logger.info('═══════════════════════════════════════════\n');

  // ── R2 ──
  const r2Buckets = Object.keys(config.r2 ?? {});
  if (r2Buckets.length > 0) {
    logger.info('📦 R2 自定义域名\n');
    for (const bucket of r2Buckets) {
      logger.info(`  桶: ${bucket}`);
      try {
        const domains = await listR2Domains(bucket);
        if (domains.length === 0) {
          logger.info('    (无自定义域名)');
        }
        for (const d of domains) {
          const em = domainStatusEmoji(d.status);
          const sslEm = d.ssl?.status === 'active' ? '🔒' : '⚠️';
          logger.info(
            `    ${em} ${d.domain}  ${sslEm} SSL:${d.ssl?.status ?? 'unknown'}  Zone:${zoneMap.get(d.zoneId) ?? d.zoneId}`,
          );
        }
      } catch (e: unknown) {
        logger.info(`    ❌ 查询失败: ${e instanceof Error ? e.message : String(e)}`);
      }
      logger.info('');
    }
  }

  // ── Pages ──
  const pagesProjects = Object.keys(config.pages ?? {});
  if (pagesProjects.length > 0) {
    logger.info('📄 Pages 自定义域名\n');
    for (const project of pagesProjects) {
      logger.info(`  项目: ${project}`);
      try {
        const domains = await listPagesDomains(project);
        if (domains.length === 0) {
          logger.info('    (无自定义域名)');
        }
        for (const d of domains) {
          const em = domainStatusEmoji(d.status);
          const sslEm = d.ssl?.status === 'active' ? '🔒' : '⚠️';
          logger.info(`    ${em} ${d.name}  ${sslEm} SSL:${d.ssl?.status ?? 'unknown'}`);
        }
      } catch (e: unknown) {
        logger.info(`    ❌ 查询失败: ${e instanceof Error ? e.message : String(e)}`);
      }
      logger.info('');
    }
  }

  // ── Workers Routes ──
  const hasRoutes = (config.workers?.routes?.length ?? 0) > 0;
  const hasWorkerDomains = Object.keys(config.workers?.domains ?? {}).length > 0;

  if (hasRoutes || hasWorkerDomains) {
    logger.info('⚡ Workers\n');

    if (hasRoutes) {
      logger.info('  路由:');
      try {
        const routes = await listWorkerRoutes();
        if (routes.length === 0) {
          logger.info('    (无路由)');
        }
        for (const r of routes) {
          logger.info(`    ${r.pattern}  →  ${r.script}`);
        }
      } catch (e: unknown) {
        logger.info(`    ❌ 查询失败: ${e instanceof Error ? e.message : String(e)}`);
      }
      logger.info('');
    }

    if (hasWorkerDomains) {
      logger.info('  自定义域名:');
      try {
        const domains = await listWorkerDomains();
        if (domains.length === 0) {
          logger.info('    (无自定义域名)');
        }
        for (const d of domains) {
          const em = domainStatusEmoji(d.status);
          const zone = zoneMap.get(d.zone_id) ?? d.zone_id;
          logger.info(`    ${em} ${d.hostname}  →  ${d.service}  Zone:${zone}`);
        }
      } catch (e: unknown) {
        logger.info(`    ❌ 查询失败: ${e instanceof Error ? e.message : String(e)}`);
      }
      logger.info('');
    }
  }

  // ── Zones ──
  logger.info('🌐 可用 Zones\n');
  for (const z of zones) {
    logger.info(`  ${z.name}  (${z.id.slice(0, 8)}…)  ${z.status}`);
  }
  logger.info('');

  logger.info('═══════════════════════════════════════════');
}

main().catch((err: Error) => {
  logger.error(`❌ 错误:${err.message}`);
  process.exit(1);
});
