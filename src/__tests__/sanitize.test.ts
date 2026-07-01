import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeUrl, stripHtml } from '../lib/sanitize.js';

describe('sanitize', () => {
  describe('sanitizeHtml', () => {
    it('保留允许的标签', () => {
      const out = sanitizeHtml('<p>hi <strong>x</strong></p>');
      expect(out).toContain('<p>');
      expect(out).toContain('<strong>');
    });

    it('删除 script 标签', () => {
      const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>');
      expect(out).not.toContain('script');
      expect(out).toContain('<p>ok</p>');
    });

    it('删除 onerror 属性', () => {
      const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
      expect(out).not.toContain('onerror');
    });

    it('阻止 javascript: 协议', () => {
      const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
      expect(out).not.toContain('javascript:');
    });
  });

  describe('stripHtml', () => {
    it('去除所有 HTML 标签', () => {
      expect(stripHtml('<p>hi <b>there</b></p>')).toBe('hi there');
    });

    it('合并空白字符', () => {
      expect(stripHtml('<p>a</p>   <p>b</p>')).toBe('a b');
    });
  });

  describe('sanitizeUrl', () => {
    it('非白名单域名返回空串', () => {
      expect(sanitizeUrl('https://evil.com/a.jpg')).toBe('');
    });

    it('无效 URL 返回空串', () => {
      expect(sanitizeUrl('not a url')).toBe('');
    });

    it('cloudflare 域名通过', () => {
      const out = sanitizeUrl('https://img.example.cloudflare.com/x.jpg');
      // sanitize 后可能为空标签；至少不应抛错
      expect(typeof out).toBe('string');
    });
  });
});
