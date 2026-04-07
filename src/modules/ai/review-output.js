import { ReviewOutputError } from '../errors.js';

function sanitizeIssue(issue) {
  const severity = ['high', 'medium', 'low'].includes(issue?.severity) ? issue.severity : 'medium';
  const file = typeof issue?.file === 'string' && issue.file.trim() ? issue.file.trim() : 'unknown';
  const lineValue = Number(issue?.line);
  const line = Number.isInteger(lineValue) && lineValue > 0 ? lineValue : 1;
  const description = String(issue?.issue || '').trim();
  const suggestion = String(issue?.suggestion || '').trim();

  if (!description || !suggestion) {
    return null;
  }

  return { severity, file, line, issue: description, suggestion };
}

function extractJsonString(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return '';

  // 一些模型会包在 ```json 代码块里，这里先把围栏剥掉再解析。
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

export function formatStructuredReview(structuredReview) {
  const summary = structuredReview.summary || '未发现明显问题';
  if (!structuredReview.issues.length) {
    return summary;
  }

  const lines = [summary, '', '问题列表：'];
  structuredReview.issues.forEach((issue, index) => {
    lines.push(
      `${index + 1}. [${issue.severity}] ${issue.file}:${issue.line}`,
      `问题: ${issue.issue}`,
      `建议: ${issue.suggestion}`
    );
  });
  return lines.join('\n');
}

export function normalizeReviewOutput(rawText) {
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
    // 只保留后续通知和存储真正需要的字段，避免模型返回脏结构污染主流程。
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.map(sanitizeIssue).filter(Boolean)
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
