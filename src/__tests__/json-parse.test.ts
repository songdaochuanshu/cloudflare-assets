import { describe, it, expect } from 'vitest';
import {
  safeJSONParse,
  findFirstJSONBlock,
  attemptJSONRepair,
  parseJSON,
} from '../lib/json-parse.js';

describe('safeJSONParse', () => {
  it('parses valid JSON', () => {
    expect(safeJSONParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(safeJSONParse('{broken')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(safeJSONParse('')).toBeNull();
  });
});

describe('findFirstJSONBlock', () => {
  it('finds a simple JSON object', () => {
    expect(findFirstJSONBlock('{"key":"value"}')).toBe('{"key":"value"}');
  });

  it('finds JSON embedded in text', () => {
    const raw = 'Here is the result:\n{"category":"AI","tags":["test"]}\nDone.';
    expect(findFirstJSONBlock(raw)).toBe('{"category":"AI","tags":["test"]}');
  });

  it('handles nested braces', () => {
    const raw = 'prefix {"a":{"b":1}} suffix';
    expect(findFirstJSONBlock(raw)).toBe('{"a":{"b":1}}');
  });

  it('returns null when no { found', () => {
    expect(findFirstJSONBlock('no json here')).toBeNull();
  });

  it('returns null for unclosed brace', () => {
    expect(findFirstJSONBlock('{"unclosed": ')).toBeNull();
  });
});

describe('attemptJSONRepair', () => {
  it('strips markdown code fences', () => {
    const input = '```json\n{"key":"value"}\n```';
    expect(attemptJSONRepair(input)).toBe('{"key":"value"}');
  });

  it('strips code fences without json label', () => {
    const input = '```\n{"key":"value"}\n```';
    expect(attemptJSONRepair(input)).toBe('{"key":"value"}');
  });

  it('removes trailing comma before }', () => {
    expect(attemptJSONRepair('{"a":1,}')).toBe('{"a":1}');
  });

  it('removes trailing comma before ]', () => {
    expect(attemptJSONRepair('[1,2,3,]')).toBe('[1,2,3]');
  });

  it('handles combined: code fence + trailing comma', () => {
    const input = '```json\n{"a":1,"b":[2,3,],}\n```';
    expect(attemptJSONRepair(input)).toBe('{"a":1,"b":[2,3]}');
  });
});

describe('parseJSON', () => {
  it('parses plain JSON directly', () => {
    expect(parseJSON<{ x: number }>('{"x":42}')).toEqual({ x: 42 });
  });

  it('extracts JSON from code fence', () => {
    const raw = '```json\n{"category":"AI","tags":["test"]}\n```';
    expect(parseJSON<{ category: string }>(raw)).toEqual({ category: 'AI', tags: ['test'] });
  });

  it('extracts JSON from surrounding text', () => {
    const raw = 'Here is the result:\n{"chosen":"title one","reason":"good"}\nThat is all.';
    expect(parseJSON<{ chosen: string }>(raw)).toEqual({ chosen: 'title one', reason: 'good' });
  });

  it('repairs trailing commas in code fence', () => {
    const raw = '```json\n{"a":1,"b":2,}\n```';
    expect(parseJSON<{ a: number }>(raw)).toEqual({ a: 1, b: 2 });
  });

  it('throws on completely unparseable input', () => {
    expect(() => parseJSON('not json at all')).toThrow('无法解析 AI 返回的 JSON');
  });

  it('handles real-world AI response with code fence and trailing comma', () => {
    const raw = `根据文章内容，返回如下 JSON：

\`\`\`json
{
  "category": "DevOps",
  "tags": ["Docker", "CI/CD", "自动化", "容器化"],
}
\`\`\`

希望对你有帮助！`;
    const result = parseJSON<{ category: string; tags: string[] }>(raw);
    expect(result.category).toBe('DevOps');
    expect(result.tags).toHaveLength(4);
  });

  it('handles AI response with extra text before JSON', () => {
    const raw = `好的，我来帮你分析一下这个标题。

{
  "chosen": "Docker 实战指南",
  "reason": "通用性强"
}

以上就是我的选择。`;
    const result = parseJSON<{ chosen: string }>(raw);
    expect(result.chosen).toBe('Docker 实战指南');
  });
});
