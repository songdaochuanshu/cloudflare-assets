// utils/anti-slop.mjs - 基于 stop-slop 思路，强力去除 AI 味
// 参考：https://github.com/hardikpandya/stop-slop

/**
 * 去除 AI 写作痕迹
 * 核心原则：删掉一切 AI 味的东西，不要试图"改写"成看起来像人写的
 */

// ──────────────────────────────────────────────
// 第一层：直接删除的句子/段落
// ──────────────────────────────────────────────

const DELETE_PATTERNS = [
  // 结尾总结段落（最重要！AI 最明显的特征）
  /^总之[，,]?.+$/gm,
  /^总的来说[，,]?.+$/gm,
  /^综上所述[，,]?.+$/gm,
  /^总结一下[，,]?.+$/gm,
  /^总结起来[，,]?.+$/gm,
  /^归根结底[，,]?.+$/gm,
  /^说到底[，,]?.+$/gm,
  /^以上就是[本文]?.*[内容经验分享]?[，,。]?$/gm,
  /^以上[就是]?全部了[。]?$/gm,

  // AI 结尾套话
  /^希望[这本文].*[对你你们大家].*[有帮助有所启发启发][。！]?$/gm,
  /^希望.*对.*有.*[。！]?$/gm,
  /^如果有任何问题[，,]?.*$/gm,
  /^欢迎[在评论区].*$/gm,
  /^感谢[阅读观看][！。]?$/gm,
  /^谢谢[阅读观看][！。]?$/gm,
  /^祝[你您大家].*$/gm,
  /^加油[！]?$/gm,
  /^冲鸭[！]?$/gm,
  /^冲[！]?$/gm,

  // 聊天式结尾
  /^就[跟和]大家聊到这里[，,。]?$/gm,
  /^就跟大家聊到这里[，,。]?$/gm,
  /^下次[咱们再].*$/gm,
  /^拜拜[！。]?$/gm,
  /^下期见[！。]?$/gm,
  /^我们下期[再见]?[！。]?$/gm,
  /^咱们下期[再见]?[！。]?$/gm,

  // "让我们一起" 类
  /^让我们[一起|一块]?[^\n]+[吧]?[！。]?$/gm,
  /^一起[来]?[^\n]+吧[！。]?$/gm,

  // 祝福/邀请
  /^喜欢的话[，,]?.*$/gm,
  /^如果[你]?觉得有用[，,]?.*$/gm,
  /^[欢迎点赞关注收藏].*$/gm,
  /^别忘了[点赞关注收藏].*$/gm,

  // 开场白（匹配行首，后面不管跟什么内容）
  [/^嘿[，,]?朋友们[！,，]?\s*/gm, ''],
  [/^哈喽[，,]?[们]?\s*/gm, ''],
  [/^大家好[，,]?[们]?\s*/gm, ''],
  [/^大家好呀[，,]?\s*/gm, ''],
  [/^小伙伴们[，,]?\s*/gm, ''],
  [/^各位好[，,]?\s*/gm, ''],
  [/^嗨[，,]?[你]?\s*/gm, ''],
  [/^嗨呀[，,]?\s*/gm, ''],
  [/^好[吧物]了[，,]?\s*/gm, ''],
  [/^闲话少说[，,]?\s*/gm, ''],
  [/^废话不多说[，,]?\s*/gm, ''],
  [/^进入正题[，,]?\s*/gm, ''],
  [/^直入主题[，,]?\s*/gm, ''],

  // AI 典型开头句式
  [/^今天[咱们来].*聊[聊]?[一个]?\s*/gm, ''],
  [/^说[实是]话[，,]?\s*/gm, ''],
  [/^不得不说[，,]?\s*/gm, ''],
  [/^众所周知[，,]?\s*/gm, ''],
  [/^毫无疑问[，,]?\s*/gm, ''],
  [/^不[吹夸]不黑[，,]?\s*/gm, ''],
  [/^在我看来[，,]?\s*/gm, ''],
  [/^依我看[，,]?\s*/gm, ''],

  // 无意义的整行
  [/^[\s]*$/, ''],
  [/^今天[，,]?\s*$/, ''],
  [/^(好了)[，,]?\s*$/, ''],
];

// ──────────────────────────────────────────────
// 第二层：句子内替换
// ──────────────────────────────────────────────

const REPLACEMENTS = [
  // 填充词（stop-slop: cut filler phrases）
  [/呃[，,]?/g, ''],
  [/嗯[，,]?/g, ''],
  [/啊[，,]?/g, ''],
  [/呀[，,]?/g, ''],
  [/嘛[，,]?/g, ''],
  [/哦[，,]?/g, ''],
  [/哈[，,]?/g, ''],
  [/哈哈[，,]?/g, ''],
  [/哈哈哈[，,]?/g, ''],
  [/嘿嘿[，,]?/g, ''],

  // 过度修饰（stop-slop: cut adverbs）
  [/简直太[^\s！。，,]+了/gi, (m) => m.replace(/简直太/, '很').replace(/了$/, '')],
  [/简直是[^\s！。，,]+神器/gi, ''],
  [/真的[很太]好用/gi, '好用'],
  [/非常简单/g, '简单'],
  [/极其简单/g, '简单'],
  [/非常方便/g, '方便'],
  [/非常实用/g, '实用'],
  [/非常强大/g, '强大'],
  [/特别强大/g, '强大'],
  [/相当不错/g, '不错'],
  [/太棒了/gi, ''],
  [/太赞了/gi, ''],
  [/超赞[的]?/gi, ''],
  [/YYDS/gi, ''],
  [/绝绝子/gi, ''],
  [/泰酷啦/gi, ''],

  // 口水话连接词
  [/其实呢[，,]?/g, ''],
  [/然后呢[，,]?/g, '然后'],
  [/不过呢[，,]?/g, '不过'],
  [/基本上[，,]?/g, ''],
  [/可以说[，,]?/g, ''],
  [/所谓[的]?[，,]?/g, ''],
  [/话说[，,]?/g, ''],
  [/那么[，,]?/g, ''],
  [/话虽如此[，,]?/g, ''],

  // AI 引导语（stop-slop: throat-clearing openers）
  [/说起来[，,]?/g, ''],
  [/话说回来[，,]?/g, ''],
  [/话不多说[，,]?/g, ''],
  [/长话短说[，,]?/g, ''],
  [/简单说一下[，,]?/g, ''],
  [/先说这么多[，,]?/g, ''],
  [/值得注意的是[，,]?/g, ''],
  [/需要注意的是[，,]?/g, ''],
  [/特别要注意的是[，,]?/g, ''],
  [/划重点[：:]/g, ''],
  [/敲黑板[：:]/g, ''],
  [/客观来说[，,]?/g, ''],
  [/整体来看[，,]?/g, ''],
  [/说实在的[，,]?/g, ''],

  // 主观插入语
  [/我觉着[，,]?/g, ''],
  [/我觉得[，,]?/g, ''],
  [/我认为[，,]?/g, ''],
  [/我个人[认?为?觉?得]?[，,]?/g, ''],
  [/从我的角度[来看]?[，,]?/g, ''],
  [/相信我[，,]?/g, ''],

  // 时间引导
  [/^今天[，,]?(咱们?|我)?/gm, ''],
  [/^最近[，,]?/gm, ''],

  // 感叹号清理（stop-slop: no performative emphasis）
  [/[！!][！!]+/g, '！'],
  [/[？?][？?]+/g, '？'],
  [/[，,]+/g, '，'],

  // 连续标点
  [/[，。][，。]/g, '，'],

  // 无意义括号补充
  [/[（(]其实[）)]/g, ''],
  [/[（(]简单说[）)]/g, ''],
  [/[（(]总的来说[）)]/g, ''],
  [/[（(]值得注意的是[）)]/g, ''],
];

// ──────────────────────────────────────────────
// 第三层：结尾截断（最激进的处理）
// ──────────────────────────────────────────────

const TAIL_TRUNCATE_PATTERNS = [
  /\n总之[，,].+$/gs,
  /\n总的来说[，,].+$/gs,
  /\n综上所述[，,].+$/gs,
  /\n总结[一下起来]?[：:,，].+$/gs,
  /\n归根结底[，,].+$/gs,
  /\n说到底[，,].+$/gs,
  /\n以上就是[本文]?.+$/gs,
  /\n希望[这本文].*[对你你们大家].*[有帮助有所启发].+$/gs,
  /\n就[跟和]大家聊到这里.+$/gs,
  /\n如果有任何问题.+$/gs,
  /\n欢迎[在评论区].+$/gs,
  /\n感谢阅读.+$/gs,
  /\n祝[你您大家].+$/gs,
  /\n让我们[一起]?.+$/gs,
  /\n好了[，,]?今天的分享.+$/gs,
];

// ──────────────────────────────────────────────
// 处理流程
// ──────────────────────────────────────────────

function collapseBlankLines(text) {
  return text.replace(/\n{3,}/g, '\n\n');
}

function trimLines(text) {
  return text.split('\n')
    .map(line => line.trimEnd())
    .join('\n');
}

// 评分：基于 stop-slop 的 5 维度
function scoreText(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const totalLen = text.replace(/\s/g, '').length;
  const avgLen = totalLen / Math.max(lines.length, 1);

  const badWords = [
    '嘿', '朋友们', '大家好', '小伙伴', '其实', '后来',
    '简直', '太棒了', '太赞了', 'YYDS', '我觉着', '我认为',
    '相信我', '你会发现', '划重点', '希望对大家有帮助',
    '让我们一起', '欢迎在评论区', '感谢阅读', '好了',
    '今天', '最近呢', '话说回来', '说起来', '记得上次',
    '总之', '总的来说', '综上所述', '总结一下',
    '拜拜', '下期见', '就跟大家聊说到这里',
  ];

  let badCount = 0;
  for (const w of badWords) {
    const regex = new RegExp(w, 'gi');
    badCount += (text.match(regex) || []).length;
  }

  const exclamationCount = (text.match(/[！!]/g) || []).length;
  const exclamationRatio = exclamationCount / Math.max(lines.length, 1);

  let score = 100 - (badCount * 8) - (exclamationRatio * 30);

  if (avgLen > 50 && avgLen < 200) score += 10;

  const sentences = text.split(/[。！？.!?]/);
  const avgSentLen = sentences.map(s => s.trim().length).filter(l => l > 0)
    .reduce((a, b) => a + b, 0) / Math.max(sentences.filter(s => s.trim()).length, 1);
  if (avgSentLen > 10 && avgSentLen < 50) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function removeAISlop(text) {
  let result = text;

  // 1. 先截掉结尾总结段落
  for (const pattern of TAIL_TRUNCATE_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // 2. 删除整行模式
  for (const pattern of DELETE_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // 3. 句子内替换
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = typeof replacement === 'function'
      ? result.replace(pattern, replacement)
      : result.replace(pattern, replacement);
  }

  // 4. 清理
  result = trimLines(result);
  result = collapseBlankLines(result);
  result = result.replace(/^\n+/, '').replace(/\n+$/, '');
  result = collapseBlankLines(result);

  const score = scoreText(result);
  const lines = result.split('\n').filter(l => l.trim());
  const avgLen = lines.length > 0
    ? Math.round(result.replace(/\s/g, '').length / lines.length)
    : 0;

  return { content: result, score, avgLen };
}

export function scoreContent(text) {
  return scoreText(text);
}
