const EMPTY_CATCH_RE = /catch\s*\([^)]*\)\s*\{\s*\}/;
const JSON_PARSE_RE = /\bJSON\.parse\s*\(/;
const PROMISE_CHAIN_RE = /\.then\s*\(/;

export function checkNullSafety(fileEntry, hunkText) {
  const issues = [];
  const hunkBlob = hunkText || fileEntry.addedLines.map((l) => l.raw).join('\n');

  for (const { line, content, raw } of fileEntry.addedLines) {
    if (EMPTY_CATCH_RE.test(content)) {
      issues.push({
        severity: 'medium',
        file: fileEntry.file,
        line,
        issue: '空的 catch 块会吞掉异常，难以排查问题',
        suggestion: '至少记录错误日志，或 rethrow / 转化为业务错误',
        evidence: raw.trim(),
        source: 'static',
        ruleId: 'null-safety.emptyCatch',
        grounded: true
      });
    }

    if (JSON_PARSE_RE.test(content) && !/try\s*\{/.test(hunkBlob)) {
      issues.push({
        severity: 'medium',
        file: fileEntry.file,
        line,
        issue: 'JSON.parse 可能抛出异常，当前 hunk 内未见 try/catch 保护',
        suggestion: '使用 try/catch 包裹或校验输入后再解析',
        evidence: raw.trim(),
        source: 'static',
        ruleId: 'null-safety.jsonParseUnprotected',
        grounded: true
      });
    }
  }

  if (PROMISE_CHAIN_RE.test(hunkBlob) && !/\.catch\s*\(/.test(hunkBlob)) {
    const hit = fileEntry.addedLines.find((l) => PROMISE_CHAIN_RE.test(l.content));
    if (hit) {
      issues.push({
        severity: 'medium',
        file: fileEntry.file,
        line: hit.line,
        issue: 'Promise 链存在 .then 但同 hunk 内未见 .catch 处理',
        suggestion: '追加 .catch 或使用 async/await + try/catch',
        evidence: hit.raw.trim(),
        source: 'static',
        ruleId: 'null-safety.missingPromiseCatch',
        grounded: true
      });
    }
  }

  return issues;
}
