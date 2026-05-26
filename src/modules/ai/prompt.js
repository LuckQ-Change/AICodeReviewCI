export const REVIEW_SYSTEM_PROMPT = [
  '你是资深代码审查助手。',
  '你必须严格依据「AI 规则」和 diff 输出结构化 JSON。',
  '不要输出 Markdown，不要输出解释性前言，不要输出代码块围栏。',
  '每条 issue 必须能在 diff 中找到对应依据；禁止报告 diff 中未出现的文件或行号。',
  '如果没有发现问题，也必须返回合法 JSON。'
].join(' ');

export function buildReviewPrompt({ rulesText, diff, context, repoContextText }) {
  const parts = [
    '请仅根据以下「AI 规则」审查代码变更，并输出 JSON。',
    '不要重复静态分析已覆盖的项（空 catch、敏感日志、定时器 cleanup 等）。',
    '',
    '输出格式：',
    '{',
    '  "summary": "一句话总结，没有问题时写未发现明显问题",',
    '  "issues": [',
    '    {',
    '      "severity": "high|medium|low",',
    '      "file": "相对路径（必须出现在 diff 中）",',
    '      "line": 1,',
    '      "issue": "问题描述",',
    '      "suggestion": "修改建议",',
    '      "evidence": "从 diff 复制的原文片段，不超过 120 字"',
    '    }',
    '  ]',
    '}',
    '',
    'AI 规则：',
    rulesText || '无额外规则',
    '',
    '提交上下文：',
    `作者: ${context.authorName} <${context.authorEmail}>`,
    `提交信息: ${context.message}`,
    `提交哈希: ${context.hash}`,
    `提交时间: ${context.date}`
  ];

  if (repoContextText) {
    parts.push('', repoContextText);
  }

  parts.push('', 'Diff：', diff);
  return parts.join('\n');
}
