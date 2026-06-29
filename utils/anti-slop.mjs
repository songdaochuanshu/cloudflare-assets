// utils/anti-slop.mjs
// 基于 stop-slop (https://github.com/hardikpandya/stop-slop)
// 温和版：去除明显 AI 味，但保留文章可读性

// 只删除最明显的 AI 开场白
const BANNED_OPENERS = [
  /^当然[，,\s]/,
  /^好的[，,\s]/,
  /^好的，让我们/,
  /^当然可以[，,\s]/,
  /^很高兴[为|能|你]/,
  /^让我们来/,
  /^首先让我们/,
  /^首先，我们/,
  /^很高兴为你/,
  /^感谢你的提问/,
  /^这是一个很好的问题/,
  /^好问题[，,\s]/,
  /^好的，我现在/,
  /^下面[，,\s]/,
  /^接下来[，,\s]/,
  /^首先[，,\s]我来/,
  /^简单说一下/,
  /^简单来说[，,\s]/,
];

// 只删除最明显的废话
const BANNED_PHRASES = [
  '值得注意的是',
  '需要注意的是',
  '实际上，',  // 开头的
  '说实话，',  // 开头的
  '坦白说，',  // 开头的
  '换句话说',
  '也就是说，',
  '简单来说，',
  '可以说，',
  '一般来说，',
  '总体来说，',
  '从某种意义上说',
  '如上所述',
  '综上所述',
  '总而言之',
  '归根结底',
];

// 句子级清理：保留自然表达，只清理过度重复
function cleanSentence(content) {
  let result = content;
  
  // 1. 清理行首的"实际上"、"其实"（保留中间的自然使用）
  result = result.split(/\n(实际上，)/).join('\n');
  result = result.split(/\n(其实，)/).join('\n');
  result = result.split(/\n(事实上，)/).join('\n');
  
  // 2. 保留 em dash，但删除连续使用超过2个的
  const dashMatches = result.match(/[—–]/g) || [];
  if (dashMatches.length > 2) {
    // 只替换超过的部分
    let count = 0;
    result = result.replace(/[—–]/g, () => {
      count++;
      return count <= 2 ? '—' : '';
    });
  }
  
  // 3. 不要把数字列表改掉，保持自然
  // 4. 不要删除所有"首先"，只删除连续的
  
  return result;
}

// 评估可读性
function evaluateContent(content) {
  let score = 70; // 基础分提高
  const issues = [];
  
  // 检查段落长度是否合理
  const paragraphs = content.split(/\n\n+/);
  const avgLen = paragraphs.reduce((a, p) => a + p.length, 0) / paragraphs.length;
  
  if (avgLen < 50) {
    issues.push('段落太短');
    score -= 15;
  }
  if (avgLen > 500) {
    issues.push('段落太长');
    score -= 5;
  }
  
  // 检查开头是否像 AI
  const openers = ['当然', '好的', '首先', '实际上', '值得注意的是'];
  const firstLine = content.split('\n')[0];
  const openerCount = openers.filter(o => firstLine.includes(o)).length;
  if (openerCount > 1) {
    issues.push('开头AI味重');
    score -= 10;
  }
  
  // 检查是否有太多短句
  const shortLines = content.split('\n').filter(l => l.length < 15);
  if (shortLines.length > 10) {
    issues.push('短句过多');
    score -= 10;
  }
  
  // 检查关键词密度
  const aiWords = ['非常', '十分', '极其', '绝对', '完全', '完美'];
  const aiCount = aiWords.reduce((c, w) => c + (content.match(new RegExp(w, 'g')) || []).length, 0);
  if (aiCount > 15) {
    issues.push('强调词过多');
    score -= 10;
  }
  
  return { 
    score: Math.max(0, Math.min(100, score)), 
    issues,
    avgLen: Math.round(avgLen)
  };
}

// 主处理函数
export function removeAISlop(content) {
  let result = content;
  
  // 1. 清理开场白（只在开头）
  for (const pattern of BANNED_OPENERS) {
    result = result.replace(pattern, '');
  }
  
  // 2. 清理废话短语（整个文件，但只删除匹配的，不改周围内容）
  for (const phrase of BANNED_PHRASES) {
    // 替换为更自然的停顿
    result = result.split(phrase).join('');
  }
  
  // 3. 句子级清理
  result = cleanSentence(result);
  
  // 4. 合并多余空行（超过3个的）
  result = result.replace(/\n{4,}/g, '\n\n\n');
  
  // 5. 保留"首先"但删除多余的（连续出现的）
  result = result.replace(/\n首先\n首先/g, '\n首先\n'); // 只删一个
  result = result.replace(/\n首先\n首先\n首先/g, '\n首先\n首先\n');
  
  // 6. 评估
  const evaluation = evaluateContent(result);
  
  console.log('[anti-slop] ✅ 去 AI 味完成');
  if (evaluation.issues.length > 0) {
    console.log('[anti-slop] ⚠️ 建议改进:', evaluation.issues.join(', '));
  }
  console.log(`[anti-slop] 📊 可读性评分: ${evaluation.score}/100`);
  console.log(`[anti-slop] 📝 平均段落长度: ${evaluation.avgLen} 字符`);
  
  return result;
}

export default removeAISlop;
