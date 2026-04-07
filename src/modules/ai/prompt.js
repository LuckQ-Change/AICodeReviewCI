export const REVIEW_SYSTEM_PROMPT = [
  '你是资深代码审查助手。',
  '你必须严格依据规则和 diff 输出结构化 JSON。',
  '不要输出 Markdown，不要输出解释性前言，不要输出代码块围栏。',
  '如果没有发现问题，也必须返回合法 JSON。'
].join(' ');

export function buildReviewPrompt({ rulesText, diff, context }) {
  return [
    '请根据以下规则和代码变更进行审查，并输出 JSON。',
    '',
    '输出格式：',
    '{',
    '  "summary": "一句话总结，没有问题时写未发现明显问题",',
    '  "issues": [',
    '    {',
    '      "severity": "high|medium|low",',
    '      "file": "相对路径，未知时写 unknown",',
    '      "line": 1,',
    '      "issue": "问题描述",',
    '      "suggestion": "修改建议"',
    '    }',
    '  ]',
    '}',
    '',
    '规则：',
    rulesText || '无额外规则',
    '',
    '提交上下文：',
    `作者: ${context.authorName} <${context.authorEmail}>`,
    `提交信息: ${context.message}`,
    `提交哈希: ${context.hash}`,
    `提交时间: ${context.date}`,
    '',
    'Diff：',
    diff
  ].join('\n');
}
