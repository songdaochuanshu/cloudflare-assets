// src/lib/cf-api.ts
// Cloudflare REST API 客户端 — 管理 R2 / Pages / Workers 自定义域名

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '';
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? '';

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('❌ 缺少环境变量: CF_ACCOUNT_ID, CF_API_TOKEN');
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

async function cfFetch<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  const json = (await resp.json()) as CfResponse<T>;

  if (!json.success) {
    const msgs = json.errors.map(e => `[${e.code}] ${e.message}`).join('; ');
    throw new Error(`Cloudflare API 错误: ${msgs}`);
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

export async function addR2Domain(bucket: string, domain: string, zoneId?: string): Promise<R2CustomDomain> {
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
  await cfFetch(
    'DELETE',
    `/accounts/${CF_ACCOUNT_ID}/pages/projects/${project}/domains/${domain}`,
  );
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
  return cfFetch<WorkerRoute[]>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/workers/routes`,
  );
}

export async function createWorkerRoute(pattern: string, script: string): Promise<WorkerRoute> {
  return cfFetch<WorkerRoute>(
    'POST',
    `/accounts/${CF_ACCOUNT_ID}/workers/routes`,
    { pattern, script },
  );
}

export async function updateWorkerRoute(routeId: string, pattern: string, script: string): Promise<WorkerRoute> {
  return cfFetch<WorkerRoute>(
    'PUT',
    `/accounts/${CF_ACCOUNT_ID}/workers/routes/${routeId}`,
    { pattern, script },
  );
}

export async function deleteWorkerRoute(routeId: string): Promise<void> {
  await cfFetch(
    'DELETE',
    `/accounts/${CF_ACCOUNT_ID}/workers/routes/${routeId}`,
  );
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
  return cfFetch<WorkerDomain[]>(
    'GET',
    `/accounts/${CF_ACCOUNT_ID}/workers/domains`,
  );
}

export async function addWorkerDomain(hostname: string, service: string, zoneId: string): Promise<WorkerDomain> {
  return cfFetch<WorkerDomain>(
    'PUT',
    `/accounts/${CF_ACCOUNT_ID}/workers/domains`,
    { hostname, service, zone_id: zoneId },
  );
}

export async function removeWorkerDomain(domainId: string): Promise<void> {
  await cfFetch(
    'DELETE',
    `/accounts/${CF_ACCOUNT_ID}/workers/domains/${domainId}`,
  );
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
  return cfFetch<Zone[]>(
    'GET',
    `/zones?account.id=${CF_ACCOUNT_ID}&per_page=50`,
  );
}

export async function findZoneId(domain: string): Promise<string | null> {
  const zones = await listZones();
  // 从域名末尾匹配 zone（如 img.homepage.openserve.cloud 匹配 openserve.cloud）
  const parts = domain.split('.');
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(i).join('.');
    const zone = zones.find(z => z.name === candidate);
    if (zone) return zone.id;
  }
  return null;
}
