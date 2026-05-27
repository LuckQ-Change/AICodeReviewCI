export const REVIEW_SYSTEM_PROMPT = [
  '你是资深代码审查助手。',
  '你必须严格依据「AI 规则」和 diff 输出结构化 JSON。',
  '不要输出 Markdown，不要输出解释性前言，不要输出代码块围栏。',
  '每条 issue 必须能在 diff 中找到对应依据；禁止报告 diff 中未出现的文件或行号。',
  '高精度优先：宁可漏报，也不要臆测；只报你能在 diff（必要时结合「工程索引」）中确凿验证的问题。',
  '你只能看到局部 diff 与工程索引摘要，看不到完整代码库；对“资源是否释放、变量是否使用、是否为空、是否被调用、跨文件契约”等需要全局信息才能断定的问题，若相关符号在工程索引中于其他文件出现/定义，则其生命周期/使用可能由他处负责，除非 diff 内有确凿证据，否则不要报。',
  '如果没有发现问题，也必须返回合法 JSON。'
].join(' ');

export function buildReviewPrompt({ rulesText, diff, context, repoContextText }) {
  const parts = [
    '请仅根据以下「AI 规则」审查代码变更，并输出 JSON。',
    '不要重复静态分析已覆盖的项（空 catch、敏感日志、定时器 cleanup 等）。',
    '',
    '审查准则（高精度优先，违反会产生误判）：',
    '- 只报能在 diff 中直接看到证据的问题；不要因为“diff 里没看到某处理”就断定缺陷——该处理可能在未展示的代码或其他文件中。',
    '- 资源释放/关闭、变量是否使用/为空、是否被调用等跨作用域或跨文件问题：若下方「工程索引」中相关符号出现在其他文件，默认其可能在他处处理，不要报。',
    '- 不确定就不报；每条 issue 都应高置信、可独立成立。',
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
