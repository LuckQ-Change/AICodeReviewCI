const SENSITIVE_LOG_RE = /console\.(log|info|debug|warn|error)\s*\([^)]*(?:password|api[_-]?key|secret|token|credential)/i;

export function checkSecretsInLogs(fileEntry) {
  const issues = [];
  for (const { line, content, raw } of fileEntry.addedLines) {
    if (!SENSITIVE_LOG_RE.test(content)) continue;
    issues.push({
      severity: 'high',
      file: fileEntry.file,
      line,
      issue: '日志中可能输出敏感信息（password/apiKey/secret/token 等）',
      suggestion: '移除敏感字段或进行脱敏后再记录日志',
      evidence: raw.trim(),
      source: 'static',
      ruleId: 'secrets.sensitiveInLog',
      grounded: true
    });
  }
  return issues;
}
