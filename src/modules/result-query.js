import fs from 'fs';
import path from 'path';

function resolveResultsFile(options = {}) {
  const resultsDir = options.resultsDir
    ? (path.isAbsolute(options.resultsDir) ? options.resultsDir : path.join(process.cwd(), options.resultsDir))
    : path.join(process.cwd(), 'state');
  return path.join(resultsDir, 'results.jsonl');
}

function normalizeFilter(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesIssue(issue, filters) {
  if (filters.severity && normalizeFilter(issue.severity) !== filters.severity) {
    return false;
  }

  if (filters.file && !normalizeFilter(issue.file).includes(filters.file)) {
    return false;
  }

  return true;
}

function matchesEntry(entry, filters) {
  const commit = entry.result?.commit || {};

  if (filters.author) {
    const authorText = `${commit.authorName || ''} ${commit.authorEmail || ''}`.toLowerCase();
    if (!authorText.includes(filters.author)) {
      return false;
    }
  }

  if (filters.commit && !String(commit.hash || '').toLowerCase().includes(filters.commit)) {
    return false;
  }

  if (!filters.severity && !filters.file) {
    return true;
  }

  // 文件和严重级别属于 issue 级别条件，需要下沉到结构化问题列表里匹配。
  const issues = entry.result?.structuredReview?.issues || [];
  return issues.some((issue) => matchesIssue(issue, filters));
}

export function queryReviewResults(options = {}) {
  const filePath = resolveResultsFile(options);
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      count: 0,
      items: []
    };
  }

  const filters = {
    severity: normalizeFilter(options.severity),
    author: normalizeFilter(options.author),
    file: normalizeFilter(options.file),
    commit: normalizeFilter(options.commit)
  };

  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const lines = fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];
  // 倒序扫描可以优先返回最近结果，也避免历史数据大时不必要的全量遍历。
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const entry = JSON.parse(lines[index]);
    if (matchesEntry(entry, filters)) {
      items.push(entry);
    }
    if (items.length >= limit) {
      break;
    }
  }

  return {
    filePath,
    count: items.length,
    items
  };
}
