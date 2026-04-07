export function summarizeReviewResults(results = []) {
  return results.reduce((summary, item) => {
    summary.commitCount += 1;
    if (item.skipped) summary.skippedCount += 1;
    if (item.parseMode === 'fallback') summary.fallbackCount += 1;
    if (item.parseMode === 'json') summary.structuredCount += 1;
    summary.issueCount += item.structuredReview?.issues?.length || 0;
    return summary;
  }, {
    commitCount: 0,
    skippedCount: 0,
    fallbackCount: 0,
    structuredCount: 0,
    issueCount: 0
  });
}
