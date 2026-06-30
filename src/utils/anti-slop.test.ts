import { describe, it, expect } from 'vitest';
import { removeAISlop, scoreContent } from './anti-slop.js';

describe('anti-slop', () => {
  describe('removeAISlop', () => {
    it('删除 AI 结尾套话', () => {
      const input = '这是一篇正文。\n希望对大家有帮助！';
      const result = removeAISlop(input);
      expect(result.content).not.toContain('希望对大家有帮助');
    });

    it('删除"总之"类总结句', () => {
      const input = '内容正文。\n总之，这是一篇好文章。';
      const result = removeAISlop(input);
      expect(result.content).not.toContain('总之');
    });

    it('删除开场白"大家好"', () => {
      const input = '大家好，这是一篇正文。';
      const result = removeAISlop(input);
      expect(result.content).not.toContain('大家好');
      expect(result.content).toContain('这是一篇正文');
    });

    it('删除"今天我们来聊"开场白', () => {
      const input = '今天我们来聊一个话题。\n\n正文开始。';
      const result = removeAISlop(input);
      expect(result.content).not.toContain('今天我们来聊');
      expect(result.content).toContain('正文开始');
    });

    it('压缩连续感叹号', () => {
      const input = '太棒了！！！';
      const result = removeAISlop(input);
      expect(result.content).not.toContain('！！');
    });

    it('压缩连续逗号', () => {
      const input = '内容，，，，更多内容';
      const result = removeAISlop(input);
      expect(result.content).not.toContain('，，');
    });

    it('保留正常正文不动', () => {
      const input = '这是一段正常的文章内容。\n没有任何 AI 痕迹的句子。';
      const result = removeAISlop(input);
      expect(result.content).toContain('这是一段正常的文章内容');
      expect(result.content).toContain('没有任何 AI 痕迹的句子');
    });

    it('空字符串返回空字符串', () => {
      const result = removeAISlop('');
      expect(result.content).toBe('');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('返回值结构正确', () => {
      const result = removeAISlop('正常内容。');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('avgLen');
      expect(typeof result.score).toBe('number');
      expect(typeof result.avgLen).toBe('number');
    });

    it('score 在 0-100 范围内', () => {
      const result = removeAISlop('任何内容。');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('scoreContent', () => {
    it('纯 AI 风格文本分数应该低于正常文本', () => {
      const aiText = '大家好，今天我们来聊一个话题。希望对大家有帮助！总的来说，这是一篇好文章。';
      const normalText = '这是一篇关于技术实现细节的深度分析。\n文章从三个角度展开论证。\n最后给出具体的代码示例。';
      const aiScore = scoreContent(aiText);
      const normalScore = scoreContent(normalText);
      expect(normalScore).toBeGreaterThan(aiScore);
    });

    it('空文本返回合理分数', () => {
      const score = scoreContent('');
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});
