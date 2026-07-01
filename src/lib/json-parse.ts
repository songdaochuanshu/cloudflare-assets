/**
 * JSON 解析工具 — 从 AI 响应中稳健提取 JSON
 * 从 generate-article.ts 提取的纯函数，供脚本和测试复用
 */

export function safeJSONParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

export function findFirstJSONBlock(raw: string): string | null {
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) return null;
  let depth = 0;
  for (let i = startIdx; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') {
      depth--;
      if (depth === 0) return raw.slice(startIdx, i + 1);
    }
  }
  return null;
}

export function attemptJSONRepair(str: string): string {
  let s = str.trim();
  s = s
    .replace(/```(?:json)?\s*\n?/g, '')
    .replace(/```\s*$/g, '')
    .trim();
  // 去掉末尾多余的逗号（AI 最常犯的错误）
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

export function parseJSON<T = unknown>(raw: string): T {
  // 候选字符串列表（优先级从高到低）
  const candidates = [
    // 1. ```json ... ``` 代码块内
    raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)?.[1]?.trim(),
    // 2. 第一个完整 JSON 对象（扫描平衡花括号）
    findFirstJSONBlock(raw),
    // 3. 最外层 { ... } 贪心匹配
    raw.match(/^\s*(\{[\s\S]*\})/)?.[1]?.trim(),
    // 4. 整段文本兜底
    raw.trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    // 直接解析
    let result = safeJSONParse<T>(candidate);
    if (result) return result;
    // 修复后重试（去末尾逗号等）
    const repaired = attemptJSONRepair(candidate);
    result = safeJSONParse<T>(repaired);
    if (result) return result;
  }

  throw new Error('无法解析 AI 返回的 JSON: ' + raw.substring(0, 300));
}
