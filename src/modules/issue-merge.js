function issueKey(issue) {
  return [
    issue.file,
    issue.line,
    issue.issue
  ].join('|');
}

export function mergeIssues(staticIssues = [], aiIssues = []) {
  const seen = new Set();
  const merged = [];

  for (const issue of [...staticIssues, ...aiIssues]) {
    const key = issueKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
  }

  return merged;
}

export function buildStructuredReviewFromIssues(issues, summaryOverride) {
  const summary = summaryOverride
    || (issues.length ? `发现 ${issues.length} 个问题` : '未发现明显问题');

  return { summary, issues };
}
