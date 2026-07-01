import { describe, it, expect } from 'vitest';
import { buildEmailHTML, buildEmailSubject, type CrawlSummary } from '../lib/email-template.js';

const baseSummary: CrawlSummary = {
  timestamp: '2026-07-01T00:00:00Z',
  duration: '30s',
  workflow: 'crawl-lolicon',
  stats: { downloaded: { total: 5 }, skipped: 1, failed: { total: 0 } },
};

describe('email-template', () => {
  describe('buildEmailHTML', () => {
    it('成功状态使用绿色 header', () => {
      const html = buildEmailHTML(baseSummary, 'success');
      expect(html).toContain('#36a64f');
      expect(html).toContain('✅');
      expect(html).toContain('爬取成功');
    });

    it('失败状态使用红色 header', () => {
      const html = buildEmailHTML(baseSummary, 'failure');
      expect(html).toContain('#ff0000');
      expect(html).toContain('❌');
      expect(html).toContain('爬取失败');
    });

    it('包含 summary 统计值', () => {
      const html = buildEmailHTML(baseSummary, 'success');
      expect(html).toContain('>5<'); // downloaded
      expect(html).toContain('>1<'); // skipped
      expect(html).toContain('>0<'); // failed
      expect(html).toContain('30s');
    });

    it('包含 details 表格', () => {
      const summary: CrawlSummary = {
        ...baseSummary,
        details: [
          {
            filename: 'a.jpg',
            label: 'R18',
            size: '12KB',
            metadata: { title: 't1', author: 'au1', width: 100, height: 200, tags: [] },
          },
        ],
      };
      const html = buildEmailHTML(summary, 'success');
      expect(html).toContain('a.jpg');
      expect(html).toContain('R18');
      expect(html).toContain('12KB');
      expect(html).toContain('t1');
      expect(html).toContain('au1');
    });

    it('details 超过 10 条时显示省略', () => {
      const summary: CrawlSummary = {
        ...baseSummary,
        details: Array.from({ length: 15 }, (_, i) => ({
          filename: `f${i}.jpg`,
          label: 'R18',
          size: '1KB',
          metadata: { title: `t${i}`, author: `a${i}`, width: 0, height: 0, tags: [] },
        })),
      };
      const html = buildEmailHTML(summary, 'success');
      expect(html).toContain('还有 5 条记录');
      // 只展示前 10 个
      expect(html).toContain('f9.jpg');
      expect(html).not.toContain('f10.jpg');
    });

    it('error 字段被渲染到 pre 块', () => {
      const summary: CrawlSummary = { ...baseSummary, error: 'something broke' };
      const html = buildEmailHTML(summary, 'failure');
      expect(html).toContain('something broke');
      expect(html).toContain('<pre');
    });

    it('details 为空时不出表格', () => {
      const html = buildEmailHTML({ ...baseSummary, details: [] }, 'success');
      expect(html).not.toContain('<table');
    });
  });

  describe('buildEmailSubject', () => {
    it('成功以 ✅ 开头', () => {
      expect(buildEmailSubject(baseSummary, 'success')).toMatch(/^✅/);
    });

    it('失败以 ❌ 开头', () => {
      expect(buildEmailSubject(baseSummary, 'failure')).toMatch(/^❌/);
    });

    it('包含 workflow 名', () => {
      expect(buildEmailSubject(baseSummary, 'success')).toContain('crawl-lolicon');
    });
  });
});
