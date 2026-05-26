import { ReviewOutputError } from '../errors.js';

function sanitizeIssue(issue, options = {}) {
  const { requireEvidence = false } = options;
  const severity = ['high', 'medium', 'low'].includes(issue?.severity) ? issue.severity : 'medium';
  const file = typeof issue?.file === 'string' && issue.file.trim() ? issue.file.trim() : 'unknown';
  const lineValue = Number(issue?.line);
  const line = Number.isInteger(lineValue) && lineValue > 0 ? lineValue : 1;
  const description = String(issue?.issue || '').trim();
  const suggestion = String(issue?.suggestion || '').trim();
  const evidence = String(issue?.evidence || '').trim();

  if (!description || !suggestion) {
    return null;
  }
  if (requireEvidence && !evidence) {
    return null;
  }

  const normalized = {
    severity,
    file,
    line,
    issue: description,
    suggestion,
    source: issue?.source || 'ai',
    grounded: Boolean(issue?.grounded)
  };
  if (evidence) normalized.evidence = evidence;
  if (issue?.ruleId) normalized.ruleId = issue.ruleId;
  return normalized;
}

function extractJsonString(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return '';

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function sourceLabel(issue) {
  if (issue.source === 'static') return '[静态]';
  if (issue.source === 'ai') return '[AI]';
  return '';
}

export function formatStructuredReview(structuredReview) {
  const summary = structuredReview.summary || '未发现明显问题';
  if (!structuredReview.issues.length) {
    return summary;
  }

  const lines = [summary, '', '问题列表：'];
  structuredReview.issues.forEach((issue, index) => {
    const prefix = sourceLabel(issue);
    lines.push(
      `${index + 1}. ${prefix ? `${prefix} ` : ''}[${issue.severity}] ${issue.file}:${issue.line}`,
      `问题: ${issue.issue}`,
      `建议: ${issue.suggestion}`
    );
    if (issue.evidence) {
      lines.push(`依据: ${issue.evidence}`);
    }
  });
  return lines.join('\n');
}

export function normalizeReviewOutput(rawText, options = {}) {
  const { requireEvidence = false } = options;
  const normalizedText = String(rawText || '').trim();
  if (!normalizedText) {
    return {
      structuredReview: {
        summary: '模型未返回内容',
        issues: []
      },
      reviewText: '模型未返回内容',
      parseMode: 'empty'
    };
  }

  const candidate = extractJsonString(normalizedText);
  try {
    const parsed = JSON.parse(candidate);
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.map((i) => sanitizeIssue(i, { requireEvidence })).filter(Boolean)
      : [];
    const structuredReview = {
      summary: String(parsed.summary || '未发现明显问题').trim(),
      issues
    };
    return {
      structuredReview,
      reviewText: formatStructuredReview(structuredReview),
      parseMode: 'json'
    };
  } catch (error) {
    return {
      structuredReview: {
        summary: '模型返回了非结构化结果',
        issues: []
      },
      reviewText: normalizedText,
      parseMode: 'fallback',
      error: new ReviewOutputError('模型输出不是合法 JSON', {
        cause: error
      })
    };
  }
}
