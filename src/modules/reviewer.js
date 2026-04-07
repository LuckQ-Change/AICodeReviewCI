import { extractSnippets } from './utils/snippets.js';
import { filterDiffByPaths } from './utils/diff-filter.js';
import { normalizeReviewOutput } from './ai/review-output.js';

export async function reviewCommits({ config, rules, model, commits }) {
  const results = [];
  const maxSnippets = config.review?.maxSnippetsPerCommit ?? 2;
  const maxLines = config.review?.maxLinesPerSnippet ?? 20;
  const include = config.review?.include ?? [];
  const exclude = config.review?.exclude ?? [];

  for (const c of commits) {
    const filteredDiff = filterDiffByPaths(c.diff, include, exclude);
    const snippets = extractSnippets(filteredDiff, maxSnippets, maxLines);

    if (!snippets || snippets.length === 0) {
      const usedDiffEmpty = !filteredDiff || String(filteredDiff).trim().length === 0;
      results.push({
        commit: c,
        reviewText: '',
        structuredReview: { summary: '未识别到可审查的代码片段', issues: [] },
        parseMode: 'skipped',
        snippets,
        usedDiffEmpty,
        skipped: true
      });
      continue;
    }

    const compactDiff = snippets.join('\n\n');
    const rawReviewText = await model.review({
      rulesText: rules.text,
      diff: compactDiff,
      context: {
        message: c.message,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        hash: c.hash,
        date: c.date
      }
    });
    const normalized = normalizeReviewOutput(rawReviewText);

    const usedDiffEmpty = !compactDiff || String(compactDiff).trim().length === 0;
    results.push({
      commit: c,
      reviewText: normalized.reviewText,
      structuredReview: normalized.structuredReview,
      parseMode: normalized.parseMode,
      parseError: normalized.error ? normalized.error.message : undefined,
      snippets,
      usedDiffEmpty
    });
  }

  return results;
}
