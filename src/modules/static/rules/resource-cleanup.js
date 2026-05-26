export function checkResourceCleanup(fileEntry, hunkText) {
  const issues = [];
  const blob = hunkText || fileEntry.addedLines.map((l) => l.raw).join('\n');

  const hasSetInterval = fileEntry.addedLines.some((l) => /\bsetInterval\s*\(/.test(l.content));
  const hasSetTimeout = fileEntry.addedLines.some((l) => /\bsetTimeout\s*\(/.test(l.content));
  const inUseEffect = /useEffect\s*\(/.test(blob);
  const hasCleanup = /return\s*\(\)\s*=>|clearInterval|clearTimeout|removeEventListener/.test(blob);

  if ((hasSetInterval || hasSetTimeout) && inUseEffect && !hasCleanup) {
    const hit = fileEntry.addedLines.find(
      (l) => /\bsetInterval\s*\(/.test(l.content) || /\bsetTimeout\s*\(/.test(l.content)
    );
    if (hit) {
      issues.push({
        severity: 'medium',
        file: fileEntry.file,
        line: hit.line,
        issue: 'useEffect 内注册定时器但未见 cleanup（clearInterval/clearTimeout/return 清理）',
        suggestion: '在 useEffect 返回函数中清除定时器，避免组件卸载后仍执行',
        evidence: hit.raw.trim(),
        source: 'static',
        ruleId: 'resource-cleanup.timerInUseEffect',
        grounded: true
      });
    }
  }

  const hasAddListener = fileEntry.addedLines.some((l) => /\.addEventListener\s*\(/.test(l.content));
  const hasRemoveListener = /\.removeEventListener\s*\(/.test(blob);
  if (hasAddListener && !hasRemoveListener) {
    const hit = fileEntry.addedLines.find((l) => /\.addEventListener\s*\(/.test(l.content));
    issues.push({
      severity: 'medium',
      file: fileEntry.file,
      line: hit.line,
      issue: '新增 addEventListener 但同 hunk 内未见 removeEventListener',
      suggestion: '在 teardown 中移除事件监听，避免内存泄漏',
      evidence: hit.raw.trim(),
      source: 'static',
      ruleId: 'resource-cleanup.missingRemoveListener',
      grounded: true
    });
  }

  return issues;
}
