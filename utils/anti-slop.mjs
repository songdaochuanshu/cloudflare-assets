// utils/anti-slop.mjs
// 基于 stop-slop (https://github.com/hardikpandya/stop-slop)
// 用于去除 AI 写作的痕迹

// 需要删除的短语模式
const BANNED_PHRASES = [
  // 开场白 (Throat-clearing openers)
  /^(当然|好的|好的，让我们|当然可以|当然，我很|很高兴|让我们来|首先让我们|首先，我们)/gm,
  /^(当然|好的|很高兴)/,
  
  // 强调词 (Emphasis crutches)
  /非常/g,
  /十分/g,
  /极其/g,
  /相当/g,
  /格外/g,
  /颇为/g,
  /极其/g,
  
  // 商业术语 (Business jargon)
  / leveraging /gi,
  / synergize/gi,
  / actionable insights?/gi,
  / low-hanging fruit/gi,
  / end-to-end/gi,
  / touch base/gi,
  / move the needle/gi,
  / deep dive/gi,
  / circle back/gi,
  / game-changer/gi,
  / best practice/gi,
  
  // 模糊声明 (Vague declaratives)
  /这是.+的。$/gm,
  /一般来说/,
  /总体来说/,
  /从某种意义上说/,
  /可以说/,
  /可以说，/,
  
  // 元注释 (Meta-commentary)
  /正如我之前提到的/,
  /正如本文所述/,
  /如上所述/,
  /如所述/,
  /需要注意的是/,
  /值得注意的是/,
  /值得注意的是，/,
  /值得注意的是，/,
  
  // AI 常用开场
  /很高兴为你/,
  /感谢你的提问/,
  /这是一个很好的问题/,
  /好问题/,
  
  // 废话填充
  /换句话说/,
  /也就是说/,
  /也就是说，/,
  /简单来说/,
  /简单地说/,
  /坦白说/,
  /说实话/,
  /说白了/,
];

// 需要避免的结构模式
const STRUCTURAL_PATTERNS = [
  // 二元对比 (Binary contrasts)
  /一方面.{0,20}，另一方面/g,
  /不是.{0,10}，就是/g,
  /要么.{0,10}，要么/g,
  
  // 否定列表 (Negative listings)
  /不是.{0,20}，也不是/g,
  /不要.{0,20}，也不要/g,
  
  // 戏剧性断裂 (Dramatic fragmentation)
  /[\n\n].{0,5}[？！。][\n\n]/g,
  
  // 修辞铺垫 (Rhetorical setups)
  /事实上/,
  /实际上/,
  /实际上，/,
  /其实/,
  /其实，/,
  /老实说/,
  
  // 被动语态 (Passive voice) - 中文较少，但英文转中文时可能出现
  /被[^\s，、。]{0,5}/g,
];

// 句子级规则
const SENTENCE_RULES = {
  // 不要以 Wh- 词开头（中文对应）
  whStarters: ['为什么', '怎么', '怎么样', '如何', '何时', '何地', '何人', '什么是', '哪个'],
  
  // 禁止使用 em dash
  noEmDash: /[—–]/g,
  
  // 禁止短促碎片化
  staccatoPattern: /^[！。？]{1,3}$/gm,
  
  // 禁止极端化
  lazyExtremes: ['非常', '极其', '绝对', '完全', '彻底', '完美', '绝对'],
};

// 评估文章的可读性
function evaluateContent(content) {
  const lines = content.split('\n').filter(l => l.trim());
  let score = 50;
  const issues = [];
  
  // 检查是否有太多短句
  const shortSentences = content.match(/^[^\n]{0,20}[。！？\n]/gm) || [];
  if (shortSentences.length > lines.length * 0.3) {
    issues.push('太多短句');
    score -= 10;
  }
  
  // 检查被动语态
  const passiveVoice = content.match(/被[^\s，、。]{0,10}/g) || [];
  if (passiveVoice.length > 5) {
    issues.push('被动语态过多');
    score -= 10;
  }
  
  // 检查重复短语
  const commonPhrases = ['值得注意的是', '实际上', '首先', '其次', '最后'];
  commonPhrases.forEach(phrase => {
    const matches = content.match(new RegExp(phrase, 'g')) || [];
    if (matches.length > 3) {
      issues.push(`"${phrase}"出现次数过多`);
      score -= 5;
    }
  });
  
  return { score: Math.max(0, Math.min(100, score)), issues };
}

// 主处理函数
export function removeAISlop(content) {
  let result = content;
  
  // 1. 移除 banned phrases
  BANNED_PHRASES.forEach(pattern => {
    if (typeof pattern === 'string') {
      result = result.split(pattern).join('');
    } else {
      result = result.replace(pattern, '');
    }
  });
  
  // 2. 清理结构性模式
  STRUCTURAL_PATTERNS.forEach(pattern => {
    if (typeof pattern === 'string') {
      result = result.split(pattern).join('');
    } else {
      result = result.replace(pattern, '');
    }
  });
  
  // 3. 清理过度使用的副词和形容词
  const overusedAdverbs = ['非常', '十分', '极其', '相当', '特别', '非常', '相当'];
  overusedAdverbs.forEach(word => {
    const regex = new RegExp(word, 'g');
    const matches = result.match(regex) || [];
    // 保留前2次出现，其余删除
    if (matches.length > 2) {
      let count = 0;
      result = result.replace(regex, () => {
        count++;
        return count <= 2 ? word : '';
      });
    }
  });
  
  // 4. 移除多余空行（超过2个空行的合并为2个）
  result = result.replace(/\n{3,}/g, '\n\n');
  
  // 5. 清理句末冗余
  result = result.replace(/[，。；：、]$/gm, ''); // 移除行末的标点
  result = result.replace(/[，,]$/gm, ''); // 移除行末逗号
  
  // 6. 移除 AI 特有的 Markdown 格式痕迹
  // 删除过于工整的列表
  result = result.replace(/^\d+\. /gm, ''); // 数字列表
  result = result.replace(/^[-*] /gm, '');   // 符号列表
  
  // 7. 评估并报告
  const evaluation = evaluateContent(result);
  
  console.log('[anti-slop] ✅ AI 味处理完成');
  if (evaluation.issues.length > 0) {
    console.log('[anti-slop] ⚠️ 仍存在的问题:', evaluation.issues.join(', '));
  }
  console.log(`[anti-slop] 📊 可读性评分: ${evaluation.score}/100`);
  
  return result;
}

// 默认导出
export default removeAISlop;
