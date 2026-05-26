export function summarizeReviewResults(results = []) {
  return results.reduce((summary, item) => {
    summary.commitCount += 1;
    if (item.skipped) summary.skippedCount += 1;
    if (item.parseMode === 'fallback') summary.fallbackCount += 1;
    if (item.parseMode === 'json' || item.parseMode === 'hybrid') summary.structuredCount += 1;
    if (item.parseMode === 'static-only') summary.staticOnlyCount += 1;
    if (item.parseMode === 'hybrid') summary.hybridCount += 1;

    const issues = item.structuredReview?.issues || [];
    summary.issueCount += issues.length;
    summary.staticIssueCount += issues.filter((i) => i.source === 'static').length;
    summary.aiIssueCount += issues.filter((i) => i.source === 'ai').length;
    summary.groundedCount += item.groundingStats?.groundedCount || 0;
    summary.droppedCount += item.groundingStats?.droppedCount || 0;

    return summary;
  }, {
    commitCount: 0,
    skippedCount: 0,
    fallbackCount: 0,
    structuredCount: 0,
    staticOnlyCount: 0,
    hybridCount: 0,
    issueCount: 0,
    staticIssueCount: 0,
    aiIssueCount: 0,
    groundedCount: 0,
    droppedCount: 0
  });
}
