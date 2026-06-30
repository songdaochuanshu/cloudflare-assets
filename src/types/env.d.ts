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

export {};
