// src/lib/cf-api.ts
// Cloudflare REST API 客户端 — 管理 R2 / Pages / Workers 自定义域名

import { ApiError } from './errors.js';
import { logger } from './logger.js';
import { fetchWithRetry } from './retry.js';

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '';
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? '';

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  logger.fatal('缺少环境变量: CF_ACCOUNT_ID, CF_API_TOKEN');
  process.exit(1);
}

const BASE = 'https://api.cloudflare.com/client/v4';

// ──────────────────────────────────────────────
// 通用请求
// ──────────────────────────────────────────────

interface CfResponse<T = unknown> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

async function cfFetch<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const resp = await fetchWithRetry(url, opts, { timeoutMs: 15000 });
  const text = await resp.text().catch(() => '');

  let json: CfResponse<T> | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as CfResponse<T>;
    } catch {
      json = null;
    }
  }

  if (!resp.ok) {
    throw new ApiError(`Cloudflare API HTTP ${resp.status}: ${text.slice(0, 300)}`, resp.status, {
      method,
      path,
    });
  }

  if (!json) {
    throw new ApiError(`Cloudflare API 响应不是 JSON: ${text.slice(0, 300)}`, resp.status, {
      method,
      path,
    });
  }

  if (!json.success) {
    const msgs = json.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
    throw new ApiError(`Cloudflare API 错误: ${msgs}`, resp.status, {
      method,
      path,
      errors: json.errors,
    });
  }
  return json.result;
}

// ──────────────────────────────────────────────
// R2 自定义域名
// ──────────────────────────────────────────────

export interface R2CustomDomain {
  domain: string;
  status: string;
  enabled: boolean;
  zoneId: string;
  zoneName: string;
  ssl: { status: string; validationRecords?: { txt_name: string; txt_value: string }[] };
}

export async function listR2Domains(bucket: string): Promise<R2CustomDomain[]> {
  return cfFetch<R2CustomDomain[]>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/r2/buckets/${bucket}/domains/custom`,
  );
}

export async function addR2Domain(
  bucket: string,
  domain: string,
  zoneId?: string,
): Promise<R2CustomDomain> {
  const body: Record<string, unknown> = { domain, enabled: true, zoneId };
  return cfFetch<R2CustomDomain>(
    'PUT',
    `/accounts/${CF_ACCOUNT_ID}/r2/buckets/${bucket}/domains/custom/${domain}`,
    body,
  );
}

export async function removeR2Domain(bucket: string, domain: string): Promise<void> {
  await cfFetch(
    'DELETE',
    `/accounts/${CF_ACCOUNT_ID}/r2/buckets/${bucket}/domains/custom/${domain}`,
  );
}

// ──────────────────────────────────────────────
// Pages 自定义域名
// ──────────────────────────────────────────────

export interface PagesDomain {
  name: string;
  status: string;
  ssl: { status: string };
  verification_data?: { txt_name: string; txt_value: string };
}

export async function listPagesDomains(project: string): Promise<PagesDomain[]> {
  return cfFetch<PagesDomain[]>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${project}/domains`,
  );
}

export async function addPagesDomain(project: string, domain: string): Promise<PagesDomain> {
  return cfFetch<PagesDomain>(
    'POST',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${project}/domains`,
    { name: domain },
  );
}

export async function removePagesDomain(project: string, domain: string): Promise<void> {
  await cfFetch('DELETE', `/accounts/${CF_ACCOUNT_ID}/pages/projects/${project}/domains/${domain}`);
}

// ──────────────────────────────────────────────
// Workers 路由
// ──────────────────────────────────────────────

export interface WorkerRoute {
  id: string;
  pattern: string;
  script: string;
}

export async function listWorkerRoutes(): Promise<WorkerRoute[]> {
  return cfFetch<WorkerRoute[]>('GET', `/accounts/${CF_ACCOUNT_ID}/workers/routes`);
}

export async function createWorkerRoute(pattern: string, script: string): Promise<WorkerRoute> {
  return cfFetch<WorkerRoute>('POST', `/accounts/${CF_ACCOUNT_ID}/workers/routes`, {
    pattern,
    script,
  });
}

export async function updateWorkerRoute(
  routeId: string,
  pattern: string,
  script: string,
): Promise<WorkerRoute> {
  return cfFetch<WorkerRoute>('PUT', `/accounts/${CF_ACCOUNT_ID}/workers/routes/${routeId}`, {
    pattern,
    script,
  });
}

export async function deleteWorkerRoute(routeId: string): Promise<void> {
  await cfFetch('DELETE', `/accounts/${CF_ACCOUNT_ID}/workers/routes/${routeId}`);
}

// ──────────────────────────────────────────────
// Workers 自定义域名
// ──────────────────────────────────────────────

export interface WorkerDomain {
  id: string;
  hostname: string;
  service: string;
  zone_id: string;
  status: string;
}

export async function listWorkerDomains(): Promise<WorkerDomain[]> {
  return cfFetch<WorkerDomain[]>('GET', `/accounts/${CF_ACCOUNT_ID}/workers/domains`);
}

export async function addWorkerDomain(
  hostname: string,
  service: string,
  zoneId: string,
): Promise<WorkerDomain> {
  return cfFetch<WorkerDomain>('PUT', `/accounts/${CF_ACCOUNT_ID}/workers/domains`, {
    hostname,
    service,
    zone_id: zoneId,
  });
}

export async function removeWorkerDomain(domainId: string): Promise<void> {
  await cfFetch('DELETE', `/accounts/${CF_ACCOUNT_ID}/workers/domains/${domainId}`);
}

// ──────────────────────────────────────────────
// DNS Zones
// ──────────────────────────────────────────────

export interface Zone {
  id: string;
  name: string;
  status: string;
}

export async function listZones(): Promise<Zone[]> {
  return cfFetch<Zone[]>('GET', `/zones?account.id=${CF_ACCOUNT_ID}&per_page=50`);
}

export async function findZoneId(domain: string): Promise<string | null> {
  const zones = await listZones();
  // 从域名末尾匹配 zone（如 img.homepage.openserve.cloud 匹配 openserve.cloud）
  const parts = domain.split('.');
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(i).join('.');
    const zone = zones.find((z) => z.name === candidate);
    if (zone) return zone.id;
  }
  return null;
}

// ═══════════════════════════════════════════════
// Pages 项目管理
// ═══════════════════════════════════════════════

export interface PagesProject {
  id: string;
  name: string;
  subdomain: string;
  domains: string[];
  source: {
    type: string;
    config?: {
      owner: string;
      repo_name: string;
      production_branch: string;
    };
  };
  build_config: {
    build_command: string;
    destination_dir: string;
    root_file: string;
    web_analytics_tag: string;
    web_analytics_token: string;
  };
  deployment_configs: {
    production: { env_vars?: Record<string, { value: string; type: string }> };
    preview: { env_vars?: Record<string, { value: string; type: string }> };
  };
  latest_deployment?: { id: string; status: string; created_on: string };
  created_on: string;
  modified_on: string;
}

export interface PagesDeployment {
  id: string;
  short_id: string;
  project_id: string;
  project_name: string;
  commit_hash: string;
  branch: string;
  message: string;
  committed_on: string;
  created_on: string;
  modified_on: string;
  deployed_on: string;
  status: 'idle' | 'building' | 'deploying' | 'ready' | 'canceled' | 'error' | 'failure';
  environment: 'production' | 'preview';
  urls: string[];
  build_config: {
    build_command: string;
    destination_dir: string;
  };
  metadata: {
    collection_key: string;
    retry_count: number;
  };
}

export interface PagesVariable {
  name: string;
  value: string;
  type: 'secret_text' | 'plain_text' | 'number';
}

export interface PagesBuildConfig {
  build_command: string;
  destination_dir: string;
  root_file: string;
  web_analytics_tag: string;
  web_analytics_token: string;
}

/** 列出账户下所有 Pages 项目 */
export async function listPagesProjects(): Promise<PagesProject[]> {
  const result = await cfFetch<{ projects: PagesProject[]; per_page: number; total: number }>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects?per_page=50`,
  );
  return result.projects;
}

/** 获取某个 Pages 项目的详细信息 */
export async function getPagesProject(projectName: string): Promise<PagesProject> {
  return cfFetch<PagesProject>('GET', `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`);
}

/** 删除某个 Pages 项目 */
export async function deletePagesProject(projectName: string): Promise<void> {
  await cfFetch('DELETE', `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`);
}

/** 触发一次部署（可选指定分支，默认取项目的 production_branch） */
export async function triggerDeployment(
  projectName: string,
  branch?: string,
): Promise<PagesDeployment> {
  const body: Record<string, unknown> = {};
  if (branch) body.branch = branch;
  return cfFetch<PagesDeployment>(
    'POST',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
    body,
  );
}

/** 列出项目的部署历史（默认最新 20 条） */
export async function listDeployments(projectName: string, page = 1): Promise<PagesDeployment[]> {
  const result = await cfFetch<{ deployments: PagesDeployment[]; per_page: number }>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments?page=${page}&per_page=20`,
  );
  return result.deployments;
}

/** 获取某次部署的详细信息 */
export async function getDeployment(
  projectName: string,
  deploymentId: string,
): Promise<PagesDeployment> {
  return cfFetch<PagesDeployment>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments/${deploymentId}`,
  );
}

/** 获取生产环境的变量（不含 secret 具体值，secret 返回 type=secret_text） */
export async function getProjectVariables(
  projectName: string,
  environment: 'production' | 'preview' = 'production',
): Promise<PagesVariable[]> {
  return cfFetch<PagesVariable[]>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/environments/${environment}/variables`,
  );
}

/** 批量设置变量（幂等：已存在则覆盖，不存在则创建） */
export async function setProjectVariables(
  projectName: string,
  environment: 'production' | 'preview' | 'production_branch' = 'production',
  variables: Array<{ name: string; value: string; type?: string }>,
): Promise<PagesVariable[]> {
  return cfFetch<PagesVariable[]>(
    'PUT',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/environments/${environment}/variables`,
    { variables },
  );
}

/** 获取项目的构建配置 */
export async function getPagesBuildConfig(projectName: string): Promise<PagesBuildConfig> {
  return cfFetch<PagesBuildConfig>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/build-config`,
  );
}

/** 获取项目的重定向/头部规则 */
export async function getPagesTransformRules(projectName: string): Promise<unknown> {
  return cfFetch<unknown>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/transform-rules`,
  );
}

/** 获取项目统计（构建次数、部署次数） */
export async function getPagesProjectStats(projectName: string): Promise<{
  build_count: number;
  deployment_count: number;
  pages_served: number;
}> {
  return cfFetch<{ build_count: number; deployment_count: number; pages_served: number }>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/statistics`,
  );
}

/** 取消一个正在构建中的部署 */
export async function cancelDeployment(projectName: string, deploymentId: string): Promise<void> {
  await cfFetch(
    'POST',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments/${deploymentId}/cancel`,
  );
}

/** 获取 Cloudflare Pages 的账户信息（配额） */
export async function getPagesAccountInfo(): Promise<{
  allowed_member_count: number;
  build_timeout: number;
  is_runnable: boolean;
  pages_domains_limit: number;
  quota_account: { included: number; used: number };
}> {
  return cfFetch('GET', `/accounts/${CF_ACCOUNT_ID}/pages/projects`) as Promise<{
    allowed_member_count: number;
    build_timeout: number;
    is_runnable: boolean;
    pages_domains_limit: number;
    quota_account: { included: number; used: number };
  }>;
}
