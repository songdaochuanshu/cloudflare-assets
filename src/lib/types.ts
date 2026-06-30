// 公共类型定义

/** 图片元数据（来自 Lolicon API） */
export interface LoliconImage {
  pid: number;
  p: number;
  uid: number;
  title: string;
  author: string;
  width: number;
  height: number;
  tags: string[];
  ext: string;
  r18: boolean;
  uploadDate: number;
  urls: {
    original: string;
  };
}

/** Lolicon API 响应 */
export interface LoliconResponse {
  error: string;
  data: LoliconImage[];
}

/** images-info.json 中单张图片条目 */
export interface ImageEntry {
  pid: number;
  filename: string;
  url: string;
  title: string;
  author: string;
  width: number;
  height: number;
  tags: string[];
  ext: string;
  size_kb: number;
  downloaded: boolean;
}

/** images-info.json 整体结构（r18 / normal 分类） */
export interface ImagesInfo {
  r18: ImageEntry[];
  normal: ImageEntry[];
}

/** Pixiv oEmbed API 响应 */
export interface PixivOEmbed {
  type: string;
  title: string;
  author_name: string;
  author_url: string;
  width: number;
  height: number;
  url: string;
  html: string;
}

/** 工作流结果（crawl-lolicon 等生成） */
export interface WorkflowResult {
  workflow: string;
  success: boolean;
  timestamp: string;
  duration: string;
  stats: Record<string, unknown>;
  details: unknown[];
}

// ===== 新增类型（Phase 2） =====

/** 图片资产 */
export interface ImageAsset {
  id: string;
  url: string;
  title?: string;
  tags: string[];
  source: 'lolicon' | 'cnblogs' | 'manual';
  author?: string;
  pid?: number;
  uid?: number;
  r2Key: string;
  createdAt: Date;
  size?: number;
  width?: number;
  height?: number;
}

/** 博客文章 */
export interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  tags: string[];
  manifest: PostManifest;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 文章 manifest（元信息） */
export interface PostManifest {
  id: string;
  title: string;
  date: string;
  updated?: string;
  tags: string[];
  author?: string;
  excerpt?: string;
  mathjax?: boolean;
  top_img?: string | boolean;
  comments?: boolean;
  toc?: boolean;
}

/** CDN 域名类型 */
export type CdnDomainType = 'r2' | 'pages' | 'workers-route' | 'workers-cname';

/** CDN 域名 */
export interface CdnDomain {
  domain: string;
  type: CdnDomainType;
  target: string;
  proxied: boolean;
}

/** Workflow 执行状态 */
export type WorkflowStatus = 'success' | 'failure' | 'skipped';

/** 单步状态 */
export type StepStatus = 'success' | 'failure' | 'skipped' | 'cancelled';

/** 工作流执行结果（扩展版） */
export interface WorkflowResultV2 {
  workflow: string;
  status: WorkflowStatus;
  runId: number;
  runUrl: string;
  triggeredAt: Date;
  duration?: number;
  steps: StepResult[];
  error?: string;
}

/** 单步结果 */
export interface StepResult {
  name: string;
  status: StepStatus;
  duration?: number;
  output?: string;
}

/** R2 上传选项 */
export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

/** R2 列举对象条目 */
export interface ListedObject {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}
