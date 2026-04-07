import fs from 'fs';
import path from 'path';

function resolveResultsDir(config) {
  const configured = config.results?.dir;
  return configured
    ? (path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured))
    : path.join(process.cwd(), 'state');
}

function sanitizeResult(result) {
  // 只保留稳定字段，避免把运行时对象或瞬时状态写入历史结果。
  return {
    commit: {
      hash: result.commit?.hash,
      date: result.commit?.date,
      message: result.commit?.message,
      authorName: result.commit?.authorName,
      authorEmail: result.commit?.authorEmail
    },
    skipped: Boolean(result.skipped),
    parseMode: result.parseMode || 'unknown',
    parseError: result.parseError,
    reviewText: result.reviewText || '',
    structuredReview: result.structuredReview || { summary: '', issues: [] },
    snippets: Array.isArray(result.snippets) ? result.snippets : []
  };
}

export function writeReviewResults(config, payload) {
  const resultsDir = resolveResultsDir(config);
  fs.mkdirSync(resultsDir, { recursive: true });

  const latestFile = path.join(resultsDir, 'latest-results.json');
  const appendFile = path.join(resultsDir, 'results.jsonl');

  const normalizedResults = (payload.results || []).map(sanitizeResult);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    summary: payload.summary || {},
    notificationSummary: payload.notificationSummary || {},
    results: normalizedResults
  };

  fs.writeFileSync(latestFile, JSON.stringify(snapshot, null, 2), 'utf8');

  // JSONL 适合按行增量消费，不需要每次都整体重写历史数据。
  const lines = normalizedResults.map((result) => JSON.stringify({
    generatedAt: snapshot.generatedAt,
    summary: snapshot.summary,
    notificationSummary: snapshot.notificationSummary,
    result
  }));

  if (lines.length > 0) {
    fs.appendFileSync(appendFile, `${lines.join('\n')}\n`, 'utf8');
  }

  return {
    latestFile,
    appendFile,
    count: normalizedResults.length
  };
}
