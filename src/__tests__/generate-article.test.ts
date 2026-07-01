import { describe, it, expect } from 'vitest';

/**
 * generate-article.ts 核心逻辑测试
 * 测试纯函数部分：slug 生成、frontmatter 构建、文件名生成
 */

// ── 从 generate-article.ts 提取的纯逻辑 ──

function buildSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^[-]+|[-]+$/g, '')
    .substring(0, 50);
}

function buildFilename(topic: string): string {
  const date = new Date().toISOString().split('T')[0] ?? '';
  const slug = buildSlug(topic);
  return `blog/${date}-${slug}.md`;
}

function buildFrontmatter(topic: string, category: string, tags: string[]): string {
  return `---
title: ${topic}
date: ${new Date().toISOString()}
source: AI 生成(智谱 GLM-4-Flash)
category: ${category}
tags: ${JSON.stringify(tags)}
layout: post
---

`;
}

// ── 测试 ──

describe('generate-article core logic', () => {
  describe('buildSlug', () => {
    it('converts to lowercase', () => {
      expect(buildSlug('Docker 实战指南')).toBe('docker-实战指南');
    });

    it('replaces spaces with hyphens', () => {
      expect(buildSlug('Hello World')).toBe('hello-world');
    });

    it('handles special characters', () => {
      expect(buildSlug('React vs Vue: 哪个更好?')).toBe('react-vs-vue-哪个更好');
    });

    it('truncates to 50 chars', () => {
      const longTitle = 'A'.repeat(60);
      expect(buildSlug(longTitle).length).toBeLessThanOrEqual(50);
    });

    it('handles Chinese characters', () => {
      expect(buildSlug('深入理解 TypeScript')).toBe('深入理解-typescript');
    });

    it('removes leading/trailing hyphens', () => {
      expect(buildSlug('--hello--')).toBe('hello');
    });
  });

  describe('buildFilename', () => {
    it('generates blog/ prefixed filename with date', () => {
      const filename = buildFilename('Docker 入门');
      expect(filename).toMatch(/^blog\/\d{4}-\d{2}-\d{2}-docker-入门\.md$/);
    });

    it('includes today date', () => {
      const today = new Date().toISOString().split('T')[0];
      const filename = buildFilename('Test');
      expect(filename).toContain(today!);
    });
  });

  describe('buildFrontmatter', () => {
    it('contains all required fields', () => {
      const fm = buildFrontmatter('Test Title', 'DevOps', ['Docker', 'CI/CD']);
      expect(fm).toContain('title: Test Title');
      expect(fm).toContain('source: AI 生成(智谱 GLM-4-Flash)');
      expect(fm).toContain('category: DevOps');
      expect(fm).toContain('tags: ["Docker","CI/CD"]');
      expect(fm).toContain('layout: post');
    });

    it('starts and ends with ---', () => {
      const fm = buildFrontmatter('T', 'C', ['tag']);
      expect(fm.startsWith('---\n')).toBe(true);
      expect(fm).toContain('\n---\n');
    });

    it('handles empty tags', () => {
      const fm = buildFrontmatter('T', 'C', []);
      expect(fm).toContain('tags: []');
    });

    it('handles tags with special characters', () => {
      const fm = buildFrontmatter('T', 'C', ['C++', 'C#', 'Node.js']);
      expect(fm).toContain('"C++"');
      expect(fm).toContain('"C#"');
      expect(fm).toContain('"Node.js"');
    });
  });
});
