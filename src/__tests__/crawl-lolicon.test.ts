import { describe, it, expect } from 'vitest';

/**
 * crawl-lolicon.ts 核心逻辑测试
 * 测试纯函数部分：文件名生成、分类、元数据构建
 */

// ── 从 crawl-lolicon.ts 提取的纯逻辑 ──

interface LoliconImage {
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
  urls: { original: string };
}

function buildR2Key(image: LoliconImage, prefix: string): string {
  const ext = '.' + (image.ext || 'jpg');
  return prefix + image.pid + ext;
}

function buildMetadata(image: LoliconImage) {
  return {
    pid: image.pid,
    p: image.p || 0,
    uid: image.uid,
    title: image.title || '',
    author: image.author || '',
    width: image.width || 0,
    height: image.height || 0,
    tags: image.tags || [],
    ext: image.ext || 'jpg',
    r18: image.r18 || false,
    uploadDate: image.uploadDate || 0,
  };
}

function getContentType(ext: string): string {
  return ext === '.png' ? 'image/png' : 'image/jpeg';
}

const MODES = [
  { r18: 1, prefix: 'r18/', label: 'R18' },
  { r18: 0, prefix: 'normal/', label: 'Normal' },
];

// ── 测试 ──

const mockImage: LoliconImage = {
  pid: 12345678,
  p: 0,
  uid: 98765,
  title: 'Test Illustration',
  author: 'TestArtist',
  width: 1920,
  height: 1080,
  tags: ['风景', '天空', '云'],
  ext: 'jpg',
  r18: false,
  uploadDate: 1700000000,
  urls: { original: 'https://i.pixiv.cat/img-original/img/2024/01/01/00/00/00/12345678_p0.jpg' },
};

describe('crawl-lolicon core logic', () => {
  describe('buildR2Key', () => {
    it('generates correct key for normal image', () => {
      expect(buildR2Key(mockImage, 'normal/')).toBe('normal/12345678.jpg');
    });

    it('generates correct key for r18 image', () => {
      expect(buildR2Key(mockImage, 'r18/')).toBe('r18/12345678.jpg');
    });

    it('handles png extension', () => {
      const pngImage = { ...mockImage, ext: 'png' };
      expect(buildR2Key(pngImage, 'normal/')).toBe('normal/12345678.png');
    });

    it('defaults to jpg when ext is empty', () => {
      const noExtImage = { ...mockImage, ext: '' };
      expect(buildR2Key(noExtImage, 'normal/')).toBe('normal/12345678.jpg');
    });
  });

  describe('buildMetadata', () => {
    it('extracts all fields correctly', () => {
      const meta = buildMetadata(mockImage);
      expect(meta.pid).toBe(12345678);
      expect(meta.p).toBe(0);
      expect(meta.uid).toBe(98765);
      expect(meta.title).toBe('Test Illustration');
      expect(meta.author).toBe('TestArtist');
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      expect(meta.tags).toEqual(['风景', '天空', '云']);
      expect(meta.ext).toBe('jpg');
      expect(meta.r18).toBe(false);
      expect(meta.uploadDate).toBe(1700000000);
    });

    it('defaults empty fields', () => {
      const minimalImage: LoliconImage = {
        pid: 1,
        p: 0,
        uid: 0,
        title: '',
        author: '',
        width: 0,
        height: 0,
        tags: [],
        ext: '',
        r18: false,
        uploadDate: 0,
        urls: { original: '' },
      };
      const meta = buildMetadata(minimalImage);
      expect(meta.ext).toBe('jpg');
      expect(meta.title).toBe('');
      expect(meta.tags).toEqual([]);
    });
  });

  describe('getContentType', () => {
    it('returns image/png for .png', () => {
      expect(getContentType('.png')).toBe('image/png');
    });

    it('returns image/jpeg for .jpg', () => {
      expect(getContentType('.jpg')).toBe('image/jpeg');
    });

    it('returns image/jpeg for unknown extension', () => {
      expect(getContentType('.webp')).toBe('image/jpeg');
    });
  });

  describe('MODES', () => {
    it('has r18 and normal modes', () => {
      expect(MODES).toHaveLength(2);
      expect(MODES[0]?.label).toBe('R18');
      expect(MODES[0]?.prefix).toBe('r18/');
      expect(MODES[1]?.label).toBe('Normal');
      expect(MODES[1]?.prefix).toBe('normal/');
    });
  });
});
